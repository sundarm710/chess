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


SCORE = {"1-0": (1.0, 0.0), "0-1": (0.0, 1.0), "1/2-1/2": (0.5, 0.5)}

# Game phases (CLAUDE.md §17); each game's per-ply series is reduced within each.
PHASES = ("opening", "middlegame", "endgame")


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


def summarize(analysis: Dict[str, Any], *, slug: str, game: Dict[str, Any]) -> GameSummary:
    """Reduce an orchestrator analysis dict to a :class:`GameSummary`.

    Player/result metadata comes from the library `game` record (the library PGNs carry
    no headers); per-ply cells and capability flags come from `analysis`.
    """
    meta = analysis["meta"]
    # Per (feature, side): the per-ply (value, status, phase) series, in ply order.
    series: Dict[Tuple[str, str], List[Tuple[Optional[float], str, str]]] = {}
    for ply in analysis["plies"]:
        phase = ply.get("phase", "middlegame")
        for f in ply["features"]:
            series.setdefault((f["id"], f["side"]), []).append((f["value"], f["status"], phase))

    cells: List[FeatureCell] = []
    for (fid, side), vals in series.items():
        reducer = resolve_reducer(meta.get(fid, {}))
        red = REDUCERS[reducer]
        ok = [v for v, s, _ in vals if v is not None and s == "ok"]
        # Same reducer within each phase (order preserved → "end"/"last" = last in phase).
        phase_values: Dict[str, Optional[float]] = {}
        for ph in PHASES:
            okp = [v for v, s, p in vals if v is not None and s == "ok" and p == ph]
            phase_values[ph] = float(red(okp)) if okp else None
        if ok:
            cells.append(FeatureCell(fid, side, float(red(ok)), "ok", reducer, phase_values))
        else:
            cells.append(FeatureCell(fid, side, None, "unavailable", reducer, phase_values))

    return GameSummary(
        game_id=game.get("id", analysis.get("game_id", "")), slug=slug, round=int(game.get("round", 0)),
        white=game.get("white", "?"), black=game.get("black", "?"),
        welo=_elo(game.get("welo")), belo=_elo(game.get("belo")),
        result=game.get("result", "*"), eco=game.get("eco", ""),
        has_clock=analysis.get("has_clock", False), has_eval=analysis.get("has_eval", False),
        cells=tuple(cells),
    )


# --- Layer B: per-game scalars → player rollups → tournament profile ----------
# Cross-eligibility (store the full phase×colour cross only for small, dense fields):
CROSS_MAX_PLAYERS = 16
CROSS_MIN_GAMES = 8
# Minimum observations for a feature↔result correlation to be reported.
CORR_MIN_N = 10


def _new_feat() -> Dict[str, Any]:
    """A per-player, per-feature value accumulator: overall + colour + phase + cross."""
    d: Dict[str, Any] = {"all": [], "white": [], "black": [], "unavail": 0}
    for ph in PHASES:
        d[ph] = []
        d[f"{ph}:w"] = []
        d[f"{ph}:b"] = []
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


def _rollup_doc(d: Dict[str, Any], emit_cross: bool) -> Dict[str, Any]:
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
    if emit_cross:
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


def tournament_profile(
    slug: str, label: str, summaries: List[GameSummary], manifest: Dict[str, Any],
    *, has_clock: bool, has_eval: bool, feature_set_version: str, n_min: int = 3,
) -> Dict[str, Any]:
    """Build the per-tournament profile dict (the SPA contract) from game summaries."""
    players: Dict[str, _Acc] = {}
    # Tournament-level feature↔result observations: fid -> slice -> [(value, score)].
    corr: Dict[str, Dict[str, List[Tuple[float, float]]]] = {}

    for g in summaries:
        ws, bs = SCORE.get(g.result, (0.0, 0.0))
        for player, side_char, score, opp_elo in (
            (g.white, "w", ws, g.belo), (g.black, "b", bs, g.welo)
        ):
            acc = players.setdefault(player, _Acc())
            acc.games += 1
            acc.score += score
            acc.wins += score == 1.0
            acc.draws += score == 0.5
            acc.losses += score == 0.0
            if opp_elo is not None:
                acc.opp_elos.append(opp_elo)
            if g.eco:
                acc.eco[g.eco] += 1
            gvals: Dict[str, float] = {}  # this game's per-feature value for the player
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
            acc.games_rows.append({
                "id": g.game_id, "round": g.round, "color": side_char,
                "opp": g.black if side_char == "w" else g.white,
                "result": g.result, "score": score, "vals": gvals,
            })

    # Store the full phase×colour cross only for small, dense fields (else marginals only).
    games_per_player = [a.games for a in players.values()]
    median_gpp = statistics.median(games_per_player) if games_per_player else 0
    emit_cross = len(players) <= CROSS_MAX_PLAYERS and median_gpp >= CROSS_MIN_GAMES

    # Per-player profile dicts.
    player_docs: Dict[str, Any] = {}
    for name, acc in players.items():
        player_docs[name] = {
            "games": acc.games, "score": acc.score,
            "wins": acc.wins, "draws": acc.draws, "losses": acc.losses,
            "performance_elo": _performance_elo(acc),
            "avg_opp_elo": round(statistics.fmean(acc.opp_elos), 1) if acc.opp_elos else None,
            "eco_distribution": dict(acc.eco),
            "rollups": {fid: _rollup_doc(d, emit_cross) for fid, d in acc.feats.items()},
            "game_rows": sorted(acc.games_rows, key=lambda r: (r["round"], r["id"])),
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

    leaderboards = _leaderboards(player_docs, manifest, n_min)
    meta = {
        fid: {"name": m.get("name", fid), "category": m.get("category", ""),
              "higher": m.get("higher", "neutral"), "requires": m.get("requires", []),
              "description": m.get("description", "")}
        for fid, m in manifest.items()
    }
    return {
        "slug": slug, "label": label, "has_clock": has_clock, "has_eval": has_eval,
        "feature_set_version": feature_set_version, "n_min": n_min, "emit_cross": emit_cross,
        "meta": meta, "players": player_docs, "leaderboards": leaderboards,
        "result_correlation": result_correlation,
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
