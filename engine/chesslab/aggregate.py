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
from typing import Any, Callable, Dict, List, Optional, Tuple

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


def _elo(s: Any) -> Optional[int]:
    try:
        return int(s)
    except (TypeError, ValueError):
        return None


@dataclass(frozen=True)
class FeatureCell:
    """One (feature, side) reduced to a single number for one game."""

    feature_id: str
    side: str  # "w" | "b" | "shared"
    value: Optional[float]
    status: str  # "ok" | "unavailable" | "na"
    reducer: str


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
    series: Dict[Tuple[str, str], List[Tuple[Optional[float], str]]] = {}
    for ply in analysis["plies"]:
        for f in ply["features"]:
            series.setdefault((f["id"], f["side"]), []).append((f["value"], f["status"]))

    cells: List[FeatureCell] = []
    for (fid, side), vals in series.items():
        reducer = resolve_reducer(meta.get(fid, {}))
        ok = [v for v, s in vals if v is not None and s == "ok"]
        if ok:
            cells.append(FeatureCell(fid, side, float(REDUCERS[reducer](ok)), "ok", reducer))
        else:
            cells.append(FeatureCell(fid, side, None, "unavailable", reducer))

    return GameSummary(
        game_id=game.get("id", analysis.get("game_id", "")), slug=slug, round=int(game.get("round", 0)),
        white=game.get("white", "?"), black=game.get("black", "?"),
        welo=_elo(game.get("welo")), belo=_elo(game.get("belo")),
        result=game.get("result", "*"), eco=game.get("eco", ""),
        has_clock=analysis.get("has_clock", False), has_eval=analysis.get("has_eval", False),
        cells=tuple(cells),
    )


# --- Layer B: per-game scalars → player rollups → tournament profile ----------
@dataclass(frozen=True)
class PlayerFeatureRollup:
    feature_id: str
    n: int
    mean: Optional[float]
    stdev: Optional[float]
    ci: Optional[float]  # 95% CI half-width
    mean_white: Optional[float]
    mean_black: Optional[float]
    mean_won: Optional[float]
    n_unavailable: int


@dataclass
class _Acc:
    games: int = 0
    score: float = 0.0
    wins: int = 0
    draws: int = 0
    losses: int = 0
    opp_elos: List[int] = field(default_factory=list)
    eco: "Counter[str]" = field(default_factory=Counter)
    # feature_id -> {"all":[], "white":[], "black":[], "won":[], "unavail":int}
    feats: Dict[str, Dict[str, Any]] = field(default_factory=dict)


def _mean(xs: List[float]) -> Optional[float]:
    return statistics.fmean(xs) if xs else None


def _rollup(fid: str, d: Dict[str, Any]) -> PlayerFeatureRollup:
    xs = d["all"]
    n = len(xs)
    stdev = statistics.pstdev(xs) if n >= 2 else None
    ci = (1.96 * stdev / math.sqrt(n)) if (stdev is not None and n) else None
    return PlayerFeatureRollup(
        feature_id=fid, n=n, mean=_mean(xs),
        stdev=round(stdev, 3) if stdev is not None else None,
        ci=round(ci, 3) if ci is not None else None,
        mean_white=_mean(d["white"]), mean_black=_mean(d["black"]), mean_won=_mean(d["won"]),
        n_unavailable=d["unavail"],
    )


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
            for cell in g.cells:
                if cell.side not in (side_char, "shared"):
                    continue
                fa = acc.feats.setdefault(
                    cell.feature_id, {"all": [], "white": [], "black": [], "won": [], "unavail": 0}
                )
                if cell.status != "ok" or cell.value is None:
                    fa["unavail"] += 1
                    continue
                fa["all"].append(cell.value)
                fa[("white" if side_char == "w" else "black")].append(cell.value)
                if score == 1.0:
                    fa["won"].append(cell.value)

    # Per-player profile dicts.
    player_docs: Dict[str, Any] = {}
    for name, acc in players.items():
        rollups = {fid: _rollup(fid, d) for fid, d in acc.feats.items()}
        player_docs[name] = {
            "games": acc.games, "score": acc.score,
            "wins": acc.wins, "draws": acc.draws, "losses": acc.losses,
            "performance_elo": _performance_elo(acc),
            "avg_opp_elo": round(statistics.fmean(acc.opp_elos), 1) if acc.opp_elos else None,
            "eco_distribution": dict(acc.eco),
            "rollups": {
                fid: {
                    "n": r.n, "mean": round(r.mean, 3) if r.mean is not None else None,
                    "stdev": r.stdev, "ci": r.ci,
                    "mean_white": round(r.mean_white, 3) if r.mean_white is not None else None,
                    "mean_black": round(r.mean_black, 3) if r.mean_black is not None else None,
                    "mean_won": round(r.mean_won, 3) if r.mean_won is not None else None,
                    "n_unavailable": r.n_unavailable,
                }
                for fid, r in rollups.items()
            },
        }

    leaderboards = _leaderboards(player_docs, manifest, n_min)
    meta = {
        fid: {"name": m.get("name", fid), "category": m.get("category", ""),
              "higher": m.get("higher", "neutral"), "requires": m.get("requires", [])}
        for fid, m in manifest.items()
    }
    return {
        "slug": slug, "label": label, "has_clock": has_clock, "has_eval": has_eval,
        "feature_set_version": feature_set_version, "n_min": n_min,
        "meta": meta, "players": player_docs, "leaderboards": leaderboards,
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
