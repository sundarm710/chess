"""Cross-game aggregation — reduce per-ply analysis to player/tournament profiles.

The spine is a small, generic **reducer** vocabulary. Each feature declares (in its
`FeatureMeta.aggregation`) how its per-ply series reduces to one number per game; a
sensible default is derived from scope/output_type so all features work with no edits.
Player and tournament rollups are then uniform — so "who is most X" is just "rank
players by aggregated feature X", and a new feature flows in for free.

Pure functions over already-stored orchestrator output (no engine re-run, no parity
impact). Backend-only — the SPA consumes the JSON produced from this. Dependency-light:
`statistics` only, no pandas/numpy.
"""

from __future__ import annotations

import math
import statistics
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Mapping, Optional, Tuple

# --- Layer A: per-ply-series → one game scalar -------------------------------
# Each reducer takes the list of OK (non-null) per-ply values for one (feature, side).
REDUCERS: Dict[str, Callable[[List[float]], float]] = {
    "end": lambda xs: xs[-1],
    "last": lambda xs: xs[-1],
    "mean": lambda xs: statistics.fmean(xs),
    "max": lambda xs: max(xs),
    "min": lambda xs: min(xs),
    "sum": lambda xs: float(sum(xs)),
}


def resolve_reducer(meta_entry: Dict[str, Any]) -> str:
    """The reducer name for a feature: its declared `aggregation`, else a default from
    scope/output_type (GAME running features → end; positional/shared → mean)."""
    agg = (meta_entry.get("aggregation") or "").split(":")[0].strip()
    if agg:
        if agg not in REDUCERS:
            raise ValueError(f"unknown aggregation reducer: {agg!r}")
        return agg
    return "end" if meta_entry.get("scope") == "game" else "mean"


from .winprob import perspective, state_of

SCORE = {"1-0": (1.0, 0.0), "0-1": (0.0, 1.0), "1/2-1/2": (0.5, 0.5)}

# Game phases (CLAUDE.md §17); each game's per-ply series is reduced within each.
PHASES = ("opening", "middlegame", "endgame")
# Eval-state bands (side-relative win probability); per-ply series also reduce within
# each, so behavior can be read conditioned on the game state ("what they do when worse").
STATES = ("better", "equal", "worse")


def _elo(s: Any) -> Optional[int]:
    try:
        return int(s)
    except (TypeError, ValueError):
        return None


@dataclass(frozen=True)
class FeatureCell:
    """One (feature, side) reduced to a single number for one game.

    ``value`` is the reduction over the whole game; ``phase_values`` is the same
    reducer applied within each phase ("opening"/"middlegame"/"endgame"), ``None``
    where a phase had no OK plies.
    """

    feature_id: str
    side: str  # "w" | "b" | "shared"
    value: Optional[float]
    status: str  # "ok" | "unavailable" | "na"
    reducer: str
    phase_values: Mapping[str, Optional[float]] = field(default_factory=dict)
    # Same reducer applied within each side-relative eval-state band ("better" /
    # "equal" / "worse"); empty for shared cells and for games without eval.
    state_values: Mapping[str, Optional[float]] = field(default_factory=dict)


@dataclass(frozen=True)
class GameSummary:
    """A game reduced to per-(feature, side) cells, plus the metadata needed to
    attribute it to players."""

    game_id: str
    slug: str
    round: int
    white: str
    black: str
    welo: Optional[int]
    belo: Optional[int]
    result: str
    eco: str
    has_clock: bool
    has_eval: bool
    cells: Tuple[FeatureCell, ...]
    # Archetype tags from the story layer (e.g. "grind:w", "blunder_fest").
    tags: Tuple[str, ...] = ()
    # Team/federation for each side, for team events (e.g. FIDE Olympiad). None when the
    # tournament has no team concept (individual round-robins/swisses).
    wteam: Optional[str] = None
    bteam: Optional[str] = None


def summarize(analysis: Dict[str, Any], *, slug: str, game: Dict[str, Any]) -> GameSummary:
    """Reduce an orchestrator analysis dict to a :class:`GameSummary`.

    Player/result metadata comes from the library `game` record (the library PGNs carry
    no headers); per-ply cells and capability flags come from `analysis`.
    """
    meta = analysis["meta"]
    # Per (feature, side): the per-ply (value, status, phase, wp) series, in ply order.
    series: Dict[Tuple[str, str], List[Tuple[Optional[float], str, str, Optional[float]]]] = {}
    for ply in analysis["plies"]:
        phase = ply.get("phase", "middlegame")
        wp = ply.get("wp")  # white-perspective win prob (absent without eval)
        for f in ply["features"]:
            series.setdefault((f["id"], f["side"]), []).append((f["value"], f["status"], phase, wp))

    cells: List[FeatureCell] = []
    for (fid, side), vals in series.items():
        reducer = resolve_reducer(meta.get(fid, {}))
        red = REDUCERS[reducer]
        ok = [v for v, s, _, _ in vals if v is not None and s == "ok"]
        # Same reducer within each phase (order preserved → "end"/"last" = last in phase).
        phase_values: Dict[str, Optional[float]] = {}
        for ph in PHASES:
            okp = [v for v, s, p, _ in vals if v is not None and s == "ok" and p == ph]
            phase_values[ph] = float(red(okp)) if okp else None
        # And within each side-relative eval-state band (per-side cells only — a
        # shared feature has no single perspective to band by).
        state_values: Dict[str, Optional[float]] = {}
        if side in ("w", "b"):
            for st in STATES:
                oks = [v for v, s, _, wp in vals
                       if v is not None and s == "ok" and wp is not None
                       and state_of(perspective(side, wp)) == st]
                if oks:
                    state_values[st] = float(red(oks))
        if ok:
            cells.append(FeatureCell(fid, side, float(red(ok)), "ok", reducer, phase_values, state_values))
        else:
            cells.append(FeatureCell(fid, side, None, "unavailable", reducer, phase_values, state_values))

    return GameSummary(
        game_id=game.get("id", analysis.get("game_id", "")), slug=slug, round=int(game.get("round", 0)),
        white=game.get("white", "?"), black=game.get("black", "?"),
        welo=_elo(game.get("welo")), belo=_elo(game.get("belo")),
        result=game.get("result", "*"), eco=game.get("eco", ""),
        has_clock=analysis.get("has_clock", False), has_eval=analysis.get("has_eval", False),
        cells=tuple(cells),
        tags=tuple(analysis.get("story", {}).get("tags", [])),
        wteam=game.get("wteam") or None, bteam=game.get("bteam") or None,
    )


# --- Layer B: per-game scalars → player rollups → tournament profile ----------
# Minimum observations for a correlation (feature↔result, feature↔feature) to be reported.
CORR_MIN_N = 10


def _new_feat() -> Dict[str, Any]:
    """A per-player, per-feature value accumulator: overall + colour + phase + cross."""
    d: Dict[str, Any] = {"all": [], "white": [], "black": [], "unavail": 0}
    for ph in PHASES:
        d[ph] = []
        d[f"{ph}:w"] = []
        d[f"{ph}:b"] = []
    for st in STATES:
        d[f"st:{st}"] = []
    return d


@dataclass
class _Acc:
    games: int = 0
    score: float = 0.0
    wins: int = 0
    draws: int = 0
    losses: int = 0
    opp_elos: List[int] = field(default_factory=list)
    eco: "Counter[str]" = field(default_factory=Counter)
    archetypes: "Counter[str]" = field(default_factory=Counter)
    feats: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    # Per-game breakdown rows (the drill-down behind each player's means).
    games_rows: List[Dict[str, Any]] = field(default_factory=list)


def _mean(xs: List[float]) -> Optional[float]:
    return statistics.fmean(xs) if xs else None


def _slice(xs: List[float]) -> Optional[Dict[str, Any]]:
    """A compact ``{mean, n}`` for a slice (2 dp — slices are display-only), or ``None``."""
    return {"mean": round(statistics.fmean(xs), 2), "n": len(xs)} if xs else None


def _pearson(pairs: List[Tuple[float, float]]) -> Optional[float]:
    """Pearson r between a feature value and the game score (0/0.5/1), or None."""
    n = len(pairs)
    if n < CORR_MIN_N:
        return None
    xs = [p[0] for p in pairs]
    ys = [p[1] for p in pairs]
    sx, sy = statistics.pstdev(xs), statistics.pstdev(ys)
    if sx == 0 or sy == 0:  # a constant feature or all-drawn → undefined
        return None
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    cov = sum((x - mx) * (y - my) for x, y in pairs) / n
    return round(cov / (sx * sy), 3)


def _pairwise_pearson(xs: List[Optional[float]], ys: List[Optional[float]], min_n: int) -> Optional[float]:
    """Pearson r over the observations where both values are present, or None."""
    pairs = [(x, y) for x, y in zip(xs, ys) if x is not None and y is not None]
    n = len(pairs)
    if n < min_n:
        return None
    xv = [p[0] for p in pairs]
    yv = [p[1] for p in pairs]
    sx, sy = statistics.pstdev(xv), statistics.pstdev(yv)
    if sx == 0 or sy == 0:
        return None
    mx, my = statistics.fmean(xv), statistics.fmean(yv)
    cov = sum((a - mx) * (b - my) for a, b in pairs) / n
    return round(cov / (sx * sy), 3)


@dataclass(frozen=True)
class FeatureCorrelationMatrix:
    """Pairwise Pearson correlation between features, computed over per-(player, game)
    observations. A symmetric matrix with 1.0 on the diagonal and ``None`` where a pair
    has too few shared observations (or no variance)."""

    features: Tuple[str, ...]
    matrix: Tuple[Tuple[Optional[float], ...], ...]

    @classmethod
    def from_observations(
        cls, observations: List[Dict[str, float]], features: List[str], *, min_n: int = CORR_MIN_N
    ) -> "FeatureCorrelationMatrix":
        cols: Dict[str, List[Optional[float]]] = {f: [o.get(f) for o in observations] for f in features}
        n = len(features)
        mat: List[List[Optional[float]]] = [[None] * n for _ in range(n)]
        for i in range(n):
            mat[i][i] = 1.0
            for j in range(i + 1, n):
                r = _pairwise_pearson(cols[features[i]], cols[features[j]], min_n)
                mat[i][j] = r
                mat[j][i] = r
        return cls(tuple(features), tuple(tuple(row) for row in mat))

    def to_dict(self) -> Dict[str, Any]:
        return {"features": list(self.features), "r": [list(row) for row in self.matrix]}


def _rollup_doc(d: Dict[str, Any]) -> Dict[str, Any]:
    """Serialize one player-feature accumulator to the SPA rollup dict."""
    xs = d["all"]
    n = len(xs)
    stdev = statistics.pstdev(xs) if n >= 2 else None
    ci = (1.96 * stdev / math.sqrt(n)) if (stdev is not None and n) else None

    def m(key: str) -> Optional[float]:
        avg = _mean(d[key])
        return round(avg, 3) if avg is not None else None

    doc: Dict[str, Any] = {
        "n": n, "mean": m("all"),
        "stdev": round(stdev, 3) if stdev is not None else None,
        "ci": round(ci, 3) if ci is not None else None,
        "mean_white": m("white"), "n_white": len(d["white"]),
        "mean_black": m("black"), "n_black": len(d["black"]),
        "n_unavailable": d["unavail"],
    }
    phases = {ph: _slice(d[ph]) for ph in PHASES if d[ph]}
    if phases:
        doc["phases"] = phases
    states = {st: _slice(d[f"st:{st}"]) for st in STATES if d[f"st:{st}"]}
    if states:
        doc["states"] = states
    cross = {f"{ph}:{s}": _slice(d[f"{ph}:{s}"])
             for ph in PHASES for s in ("w", "b") if d[f"{ph}:{s}"]}
    if cross:
        doc["cross"] = cross
    return doc


def _performance_elo(acc: _Acc) -> Optional[float]:
    """Simple linear TPR: avg opponent Elo + 400·(wins−losses)/games."""
    if not acc.opp_elos or not acc.games:
        return None
    avg_opp = statistics.fmean(acc.opp_elos)
    return round(avg_opp + 400 * (acc.wins - acc.losses) / acc.games, 1)


def _build_rollup(
    summaries: List[GameSummary], manifest: Dict[str, Any], n_min: int,
    *, key_fn: Callable[[GameSummary, str], Optional[str]],
    opp_fn: Callable[[GameSummary, str], str],
    row_extra_fn: Optional[Callable[[GameSummary, str], Dict[str, Any]]] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    """Generic per-entity (player or team) accumulation: feature rollups, leaderboards,
    result correlation and feature↔feature correlation. ``key_fn`` picks the grouping
    entity for a (game, side); a side is skipped entirely when it returns ``None``
    (e.g. team rollup over a tournament with no team data for that game)."""
    entities: Dict[str, _Acc] = {}
    # Tournament-level feature↔result observations: fid -> slice -> [(value, score)].
    corr: Dict[str, Dict[str, List[Tuple[float, float]]]] = {}
    # One observation per (entity, game): {feature -> whole-game value}, for feature↔feature.
    observations: List[Dict[str, float]] = []

    for g in summaries:
        ws, bs = SCORE.get(g.result, (0.0, 0.0))
        for side_char, score, opp_elo in (("w", ws, g.belo), ("b", bs, g.welo)):
            key = key_fn(g, side_char)
            if key is None:
                continue
            acc = entities.setdefault(key, _Acc())
            acc.games += 1
            acc.score += score
            acc.wins += score == 1.0
            acc.draws += score == 0.5
            acc.losses += score == 0.0
            if opp_elo is not None:
                acc.opp_elos.append(opp_elo)
            if g.eco:
                acc.eco[g.eco] += 1
            gvals: Dict[str, float] = {}  # this game's whole-game value per feature
            gphases: Dict[str, Dict[str, float]] = {ph: {} for ph in PHASES}  # + per phase
            for cell in g.cells:
                if cell.side not in (side_char, "shared"):
                    continue
                fa = acc.feats.setdefault(cell.feature_id, _new_feat())
                if cell.status != "ok" or cell.value is None:
                    fa["unavail"] += 1
                    continue
                fa["all"].append(cell.value)
                fa["white" if side_char == "w" else "black"].append(cell.value)
                gvals[cell.feature_id] = round(cell.value, 2)
                co = corr.setdefault(cell.feature_id, {k: [] for k in ("all", *PHASES)})
                co["all"].append((cell.value, score))
                for ph in PHASES:
                    pv = cell.phase_values.get(ph)
                    if pv is not None:
                        fa[ph].append(pv)
                        fa[f"{ph}:{side_char}"].append(pv)
                        co[ph].append((pv, score))
                        gphases[ph][cell.feature_id] = round(pv, 2)
                for st in STATES:
                    sv = cell.state_values.get(st)
                    if sv is not None:
                        fa[f"st:{st}"].append(sv)
            # Archetype tags: a side-suffixed tag ("swindle:w") belongs to that entity
            # only; an unsuffixed tag ("blunder_fest") describes the game — both sides.
            my_tags = [t for t in g.tags if ":" not in t or t.endswith(f":{side_char}")]
            acc.archetypes.update(t.split(":")[0] for t in my_tags)
            row = {
                "id": g.game_id, "round": g.round, "color": side_char,
                "opp": opp_fn(g, side_char),
                "result": g.result, "score": score, "vals": gvals,
                "phase_vals": {ph: gphases[ph] for ph in PHASES if gphases[ph]},
                "tags": list(g.tags),
            }
            if row_extra_fn is not None:
                row.update(row_extra_fn(g, side_char))
            acc.games_rows.append(row)
            observations.append(dict(gvals))

    # Per-entity profile dicts (cross + per-game phase breakdown always emitted).
    entity_docs: Dict[str, Any] = {}
    for name, acc in entities.items():
        rows = sorted(acc.games_rows, key=lambda r: (r["round"], r["id"]))
        entity_docs[name] = {
            "games": acc.games, "score": acc.score,
            "wins": acc.wins, "draws": acc.draws, "losses": acc.losses,
            "performance_elo": _performance_elo(acc),
            "avg_opp_elo": round(statistics.fmean(acc.opp_elos), 1) if acc.opp_elos else None,
            "eco_distribution": dict(acc.eco),
            "archetypes": dict(acc.archetypes),
            "rollups": {fid: _rollup_doc(d) for fid, d in acc.feats.items()},
            "game_rows": rows,
        }

    # Tournament-level: which features correlate with winning (overall + per phase).
    result_correlation: Dict[str, Any] = {}
    for fid, obs in corr.items():
        r_all = _pearson(obs["all"])
        if r_all is None:
            continue
        entry: Dict[str, Any] = {"r": r_all, "n": len(obs["all"])}
        phases = {ph: {"r": _pearson(obs[ph]), "n": len(obs[ph])}
                  for ph in PHASES if _pearson(obs[ph]) is not None}
        if phases:
            entry["phases"] = phases
        result_correlation[fid] = entry

    # Feature↔feature correlation matrix (manifest order, present features only).
    corr_features = [fid for fid in manifest if any(fid in o for o in observations)]
    feature_correlation = FeatureCorrelationMatrix.from_observations(observations, corr_features).to_dict()

    leaderboards = _leaderboards(entity_docs, manifest, n_min)
    return entity_docs, leaderboards, result_correlation, feature_correlation


def tournament_profile(
    slug: str, label: str, summaries: List[GameSummary], manifest: Dict[str, Any],
    *, has_clock: bool, has_eval: bool, feature_set_version: str, n_min: int = 3,
) -> Dict[str, Any]:
    """Build the per-tournament profile dict (the SPA contract) from game summaries."""
    player_docs, leaderboards, result_correlation, feature_correlation = _build_rollup(
        summaries, manifest, n_min,
        key_fn=lambda g, side: g.white if side == "w" else g.black,
        opp_fn=lambda g, side: g.black if side == "w" else g.white,
    )
    # Team events only (§16/§17): first team seen for each player name, for country
    # filters in the UI. None for individual events (no wteam/bteam anywhere).
    player_team: Dict[str, str] = {}
    for g in summaries:
        if g.wteam:
            player_team.setdefault(g.white, g.wteam)
        if g.bteam:
            player_team.setdefault(g.black, g.bteam)
    for name, doc in player_docs.items():
        doc["team"] = player_team.get(name)
    meta = {
        fid: {"name": m.get("name", fid), "category": m.get("category", ""),
              "higher": m.get("higher", "neutral"), "requires": m.get("requires", []),
              "description": m.get("description", "")}
        for fid, m in manifest.items()
    }
    return {
        "slug": slug, "label": label, "has_clock": has_clock, "has_eval": has_eval,
        "feature_set_version": feature_set_version, "n_min": n_min, "emit_cross": True,
        "meta": meta, "players": player_docs, "leaderboards": leaderboards,
        "result_correlation": result_correlation, "feature_correlation": feature_correlation,
    }


def _team_matches(summaries: List[GameSummary]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Group boards into team matches (same round + team pair) and derive match-point
    standings (2/1/0), approximating FIDE team scoring — no official tiebreaks."""
    buckets: Dict[Tuple[int, Tuple[str, str]], List[GameSummary]] = {}
    for g in summaries:
        if not g.wteam or not g.bteam or g.wteam == g.bteam:
            continue
        key = (g.round, tuple(sorted((g.wteam, g.bteam))))
        buckets.setdefault(key, []).append(g)

    matches: List[Dict[str, Any]] = []
    standings: Dict[str, Dict[str, Any]] = {}
    for (rnd, (team_a, team_b)), games in buckets.items():
        pts = {team_a: 0.0, team_b: 0.0}
        boards = []
        for g in games:
            ws, bs = SCORE.get(g.result, (0.0, 0.0))
            pts[g.wteam] += ws
            pts[g.bteam] += bs
            boards.append({"white": g.white, "black": g.black, "result": g.result, "game_id": g.game_id})
        if pts[team_a] > pts[team_b]:
            match_points = {team_a: 2, team_b: 0}
        elif pts[team_a] < pts[team_b]:
            match_points = {team_a: 0, team_b: 2}
        else:
            match_points = {team_a: 1, team_b: 1}
        matches.append({
            "round": rnd, "teams": [team_a, team_b], "game_points": pts,
            "match_points": match_points, "boards": boards,
        })
        for t in (team_a, team_b):
            s = standings.setdefault(t, {
                "matches": 0, "match_points": 0, "match_w": 0, "match_d": 0, "match_l": 0,
                "game_points": 0.0,
            })
            s["matches"] += 1
            s["match_points"] += match_points[t]
            s["game_points"] += pts[t]
            if match_points[t] == 2:
                s["match_w"] += 1
            elif match_points[t] == 1:
                s["match_d"] += 1
            else:
                s["match_l"] += 1

    ranked = sorted(standings.items(), key=lambda kv: (-kv[1]["match_points"], -kv[1]["game_points"], kv[0]))
    standings_list = [{"team": t, **s, "rank": i + 1} for i, (t, s) in enumerate(ranked)]
    matches.sort(key=lambda m: m["round"])
    return matches, standings_list


def team_profile(
    slug: str, label: str, summaries: List[GameSummary], manifest: Dict[str, Any],
    *, feature_set_version: str, n_min: int = 1,
) -> Optional[Dict[str, Any]]:
    """Build the per-team profile dict for a team event (e.g. FIDE Olympiad) — same
    feature-rollup/leaderboard machinery as :func:`tournament_profile`, grouped by team
    instead of by player, plus match-level standings. Returns ``None`` when the
    tournament carries no team data (individual events)."""
    if not any(g.wteam or g.bteam for g in summaries):
        return None

    team_docs, leaderboards, result_correlation, feature_correlation = _build_rollup(
        summaries, manifest, n_min,
        key_fn=lambda g, side: (g.wteam if side == "w" else g.bteam) or None,
        opp_fn=lambda g, side: (g.bteam if side == "w" else g.wteam) or "?",
        row_extra_fn=lambda g, side: {
            "player": g.white if side == "w" else g.black,
            "opp_player": g.black if side == "w" else g.white,
        },
    )
    for name, doc in team_docs.items():
        roster = Counter(r["player"] for r in doc["game_rows"])
        doc["roster"] = [{"name": n, "games": c} for n, c in roster.most_common()]

    matches, standings = _team_matches(summaries)
    return {
        "slug": slug, "label": label, "feature_set_version": feature_set_version, "n_min": n_min,
        "teams": team_docs, "leaderboards": leaderboards, "matches": matches, "standings": standings,
        "result_correlation": result_correlation, "feature_correlation": feature_correlation,
    }


def _leaderboards(player_docs: Dict[str, Any], manifest: Dict[str, Any], n_min: int) -> Dict[str, Any]:
    boards: Dict[str, Any] = {}
    for fid, m in manifest.items():
        higher = m.get("higher", "neutral")
        rows = [
            (name, p["rollups"][fid]["mean"], p["rollups"][fid]["n"])
            for name, p in player_docs.items()
            if fid in p["rollups"] and p["rollups"][fid]["mean"] is not None
        ]
        if not rows:
            boards[fid] = {"higher": higher, "available": False, "entries": []}
            continue
        ascending = higher == "bad"
        # Qualified (n >= n_min) ranked by value first; sub-threshold pushed to the end.
        rows.sort(key=lambda r: (r[2] < n_min, (r[1] if ascending else -r[1])))
        boards[fid] = {"higher": higher, "available": True, "entries": rows}
    return boards
