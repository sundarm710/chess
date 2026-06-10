"""Game story layer — chapters, moments and archetype tags from the WP trajectory.

This is the "storied understanding" of a single game: where the balance shifted
(**chapters** — runs of the win-probability band, with each side's behavior and clock
spend inside the run), what decided it (**moments** — blunders, mistakes, big thinks,
the endgame arriving, time pressure), and what kind of game it was (**archetypes** —
grind, squeeze, single-blunder, early collapse, sacrificial attack, swindle, fortress,
time scramble, quiet draw).

Pure functions over the orchestrator's per-ply output + the parsed game; computed once
per game and stored in ``analysis["story"]``. Eval-gated: without ``%eval`` the
chapters fall back to game phases and the eval-dependent tags/moments are skipped.
Backend-only (CLAUDE.md §14) — never mirrored in JS.
"""

from __future__ import annotations

import statistics
from typing import Any, Dict, List, Optional

from .pipeline import ParsedGame
from .winprob import BLUNDER_WP, MISTAKE_WP, move_drop, perspective, wp_series

# A WP band must hold this many plies to open a chapter (shorter wobbles are absorbed).
MIN_CHAPTER_PLIES = 6
# Big think: a move taking at least this long AND at least 3x the side's median think.
BIG_THINK_MIN_SECS = 120.0
BIG_THINK_FACTOR = 3.0
TIME_PRESSURE_SECS = 300.0  # first dip under 5 minutes is a story moment
# Archetype thresholds (side-perspective WP unless stated).
COLLAPSE_WP = 0.20          # early collapse: loser at/below this by move <= COLLAPSE_MAX_MOVE
COLLAPSE_MAX_MOVE = 15
COLLAPSE_CEIL = 0.35        # ...and never above this again
GRIND_EG_SHARE = 0.40       # grind: at least this share of plies in the endgame...
GRIND_MIN_PLIES = 70        # ...over a long game, with no single decisive gift
SQUEEZE_FLOOR = 0.45        # squeeze: winner never below this after move 10...
SQUEEZE_PEAK = 0.80         # ...reaches a winning bar...
SQUEEZE_MAX_GIFT = 0.15     # ...without any single opponent drop handing it over
SAC_MIN_DEFICIT = 2         # sac attack: winner down >= 2 points of material...
SAC_MIN_WP = 0.55           # ...while their WP stays at/above this...
SAC_MIN_PLIES = 4           # ...for a sustained stretch
SWINDLE_WP = 0.25           # swindle: winner was at/below this after move 10
FORTRESS_WP = 0.30          # fortress: defender at/below this...
FORTRESS_MIN_PLIES = 15     # ...for this many consecutive plies, yet held the draw
SCRAMBLE_CLK_SECS = 120.0   # an error with under 2 minutes on the clock = scramble

_BAND_LABEL = {
    "w++": "White winning", "w+": "White better", "=": "Balanced",
    "b+": "Black better", "b++": "Black winning",
    "opening": "Opening", "middlegame": "Middlegame", "endgame": "Endgame",
}


def _band5(wp: Optional[float]) -> str:
    if wp is None:
        return "="
    if wp >= 0.80:
        return "w++"
    if wp >= 0.60:
        return "w+"
    if wp > 0.40:
        return "="
    if wp > 0.20:
        return "b+"
    return "b++"


def _move_label(ply: int, san: str) -> str:
    """SAN with its move number, e.g. ``17.Nf5`` / ``17...Re8``."""
    no = (ply + 1) // 2
    return f"{no}.{san}" if ply % 2 == 1 else f"{no}...{san}"


def _winner(result: str) -> Optional[str]:
    return {"1-0": "w", "0-1": "b"}.get(result)


def build_story(
    game: ParsedGame, plies: List[Dict[str, Any]], balances: List[int]
) -> Dict[str, Any]:
    """The story payload for one analyzed game.

    ``plies`` is the orchestrator's per-ply list (for phases + feature series);
    ``balances`` is the white−black material balance per ply.
    """
    wps = wp_series(game)
    moments = _moments(game, plies, wps)
    chapters = _chapters(game, plies, wps)
    tags = _tags(game, plies, wps, balances, moments)
    return {"chapters": chapters, "moments": moments, "tags": tags}


# -- moments -----------------------------------------------------------------
def _moments(
    game: ParsedGame, plies: List[Dict[str, Any]], wps: List[Optional[float]]
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []

    # Errors, weighed in win probability (mover's perspective).
    if game.has_eval:
        for mv in game.moves:
            drop = move_drop(mv.mover, wps[mv.ply - 1], wps[mv.ply])
            if drop is None or drop < MISTAKE_WP:
                continue
            out.append({
                "ply": mv.ply, "move": _move_label(mv.ply, mv.san), "side": mv.mover,
                "kind": "blunder" if drop >= BLUNDER_WP else "mistake",
                "wp_before": round(perspective(mv.mover, wps[mv.ply - 1]), 3),  # type: ignore[arg-type]
                "wp_after": round(perspective(mv.mover, wps[mv.ply]), 3),  # type: ignore[arg-type]
                "drop": round(drop, 3),
            })

    # Big thinks: long absolute AND long relative to the side's own pace.
    if game.has_clock:
        for side in ("w", "b"):
            emts = [(mv.ply, mv.san, mv.emt_seconds) for mv in game.moves
                    if mv.mover == side and mv.emt_seconds is not None]
            if len(emts) < 5:
                continue
            median = statistics.median(e for _, _, e in emts)
            big = [t for t in emts if t[2] >= max(BIG_THINK_MIN_SECS, BIG_THINK_FACTOR * median)]
            for ply, san, secs in sorted(big, key=lambda t: -t[2])[:3]:
                out.append({"ply": ply, "move": _move_label(ply, san), "side": side,
                            "kind": "big_think", "secs": round(secs)})
        # First dip under the time-pressure bar, per side.
        for side in ("w", "b"):
            for mv in game.moves:
                if mv.mover == side and mv.clk_seconds is not None and mv.clk_seconds < TIME_PRESSURE_SECS:
                    out.append({"ply": mv.ply, "move": _move_label(mv.ply, mv.san), "side": side,
                                "kind": "time_pressure", "secs": round(mv.clk_seconds)})
                    break

    # The endgame arriving is a structural beat of the story.
    for ply in plies:
        if ply.get("phase") == "endgame" and ply["ply"] > 0:
            mv = game.moves[ply["ply"] - 1]
            out.append({"ply": ply["ply"], "move": _move_label(ply["ply"], mv.san),
                        "side": None, "kind": "endgame_begins"})
            break

    out.sort(key=lambda m: (m["ply"], m["kind"]))
    return out


# -- chapters ----------------------------------------------------------------
def _chapters(
    game: ParsedGame, plies: List[Dict[str, Any]], wps: List[Optional[float]]
) -> List[Dict[str, Any]]:
    n = len(plies)
    if n <= 1:
        return []
    use_wp = game.has_eval
    keys = [_band5(wps[i]) if use_wp else str(plies[i]["phase"]) for i in range(1, n)]

    # Runs of the same band; absorb runs shorter than MIN_CHAPTER_PLIES.
    runs: List[List[Any]] = []  # [key, start_ply, end_ply]
    for i, k in enumerate(keys, start=1):
        if runs and runs[-1][0] == k:
            runs[-1][2] = i
        else:
            runs.append([k, i, i])
    merged: List[List[Any]] = []
    for r in runs:
        if merged and (r[2] - r[1] + 1) < MIN_CHAPTER_PLIES:
            merged[-1][2] = r[2]
        else:
            merged.append(r)
    if len(merged) > 1 and (merged[0][2] - merged[0][1] + 1) < MIN_CHAPTER_PLIES:
        merged[1][1] = merged[0][1]
        merged.pop(0)
    out2: List[List[Any]] = []
    for r in merged:  # re-merge neighbors that became equal after absorption
        if out2 and out2[-1][0] == r[0]:
            out2[-1][2] = r[2]
        else:
            out2.append(r)

    # Per-ply density series (shared) for the chapter means.
    density: Dict[int, float] = {}
    expo: Dict[str, Dict[int, float]] = {"w": {}, "b": {}}
    proph: Dict[str, Dict[int, float]] = {"w": {}, "b": {}}
    for ply in plies:
        for f in ply["features"]:
            if f["id"] == "TAC.density" and f["value"] is not None:
                density[ply["ply"]] = f["value"]
            elif f["id"] == "TAC.exposure" and f["value"] is not None:
                expo[f["side"]][ply["ply"]] = f["value"]
            elif f["id"] == "DEC.prophylaxis" and f["value"] is not None:
                proph[f["side"]][ply["ply"]] = f["value"]

    chapters: List[Dict[str, Any]] = []
    for key, a, b in out2:
        seg = game.moves[a - 1:b]
        phases = [str(plies[i]["phase"]) for i in range(a, b + 1)]
        dens = [density[i] for i in range(a, b + 1) if i in density]
        sides: Dict[str, Any] = {}
        for s in ("w", "b"):
            own = [mv for mv in seg if mv.mover == s]
            emts = [mv.emt_seconds for mv in own if mv.emt_seconds is not None]
            clks = [mv.clk_seconds for mv in own if mv.clk_seconds is not None]
            forcing = sum(1 for mv in own if mv.is_capture or mv.is_check)
            sides[s] = {
                "moves": len(own),
                "forcing": forcing,
                "forcing_rate": round(forcing / len(own), 2) if own else None,
                "captures": sum(1 for mv in own if mv.is_capture),
                "checks": sum(1 for mv in own if mv.is_check),
                "exposure": _delta(expo[s], a, b),
                "prophylaxis": _delta(proph[s], a, b),
                "time_spent": round(sum(emts)) if emts else None,
                "clock_end": round(clks[-1]) if clks else None,
            }
        chapters.append({
            "start_ply": a, "end_ply": b,
            "start_move": _move_label(a, game.moves[a - 1].san),
            "end_move": _move_label(b, game.moves[b - 1].san),
            "state": key, "label": _BAND_LABEL.get(key, key),
            "plies": b - a + 1,
            "wp_start": round(wps[a - 1], 3) if wps[a - 1] is not None else None,
            "wp_end": round(wps[b], 3) if wps[b] is not None else None,
            "dominant_phase": max(set(phases), key=phases.count),
            "density_mean": round(statistics.fmean(dens), 1) if dens else None,
            "sides": sides,
        })
    return chapters


def _delta(series: Dict[int, float], a: int, b: int) -> Optional[float]:
    """Change of a running counter across plies [a, b] (vs its value before a)."""
    if b not in series:
        return None
    before = series.get(a - 1, 0.0)
    return round(series[b] - before, 2)


# -- archetype tags ----------------------------------------------------------
def _tags(
    game: ParsedGame,
    plies: List[Dict[str, Any]],
    wps: List[Optional[float]],
    balances: List[int],
    moments: List[Dict[str, Any]],
) -> List[str]:
    tags: List[str] = []
    if not game.has_eval:
        return tags
    result = game.result
    winner = _winner(result)
    loser = {"w": "b", "b": "w"}.get(winner or "")
    blunders = [m for m in moments if m["kind"] == "blunder"]
    known = [(i, wps[i]) for i in range(1, len(wps)) if wps[i] is not None]
    if not known:
        return tags

    def persp(side: str) -> List[tuple]:
        return [(i, perspective(side, w)) for i, w in known]

    drops_by = {
        s: max((move_drop(mv.mover, wps[mv.ply - 1], wps[mv.ply]) or 0.0)
               for mv in game.moves if mv.mover == s)
        if any(mv.mover == s for mv in game.moves) else 0.0
        for s in ("w", "b")
    }

    if result == "1/2-1/2" and all(0.40 <= w <= 0.60 for _, w in known) and not blunders:
        tags.append("quiet_draw")

    if winner and loser:
        lp = persp(loser)
        for idx, (i, w) in enumerate(lp):
            if w <= COLLAPSE_WP and (i + 1) // 2 <= COLLAPSE_MAX_MOVE:
                if all(w2 <= COLLAPSE_CEIL for _, w2 in lp[idx:]):
                    tags.append(f"early_collapse:{loser}")
                break

        if len(blunders) == 1 and blunders[0]["side"] == loser:
            tags.append(f"single_blunder:{loser}")

        phases = [str(p["phase"]) for p in plies[1:]]
        eg_share = phases.count("endgame") / len(phases) if phases else 0.0
        if (eg_share >= GRIND_EG_SHARE and len(phases) >= GRIND_MIN_PLIES
                and drops_by[loser] < BLUNDER_WP + 0.05):
            tags.append(f"grind:{winner}")

        wp_w = persp(winner)
        late = [w for i, w in wp_w if (i + 1) // 2 > 10]
        if (late and min(late) >= SQUEEZE_FLOOR and max(w for _, w in wp_w) >= SQUEEZE_PEAK
                and drops_by[loser] <= SQUEEZE_MAX_GIFT):
            tags.append(f"squeeze:{winner}")

        run = 0
        for i, w in wp_w:
            against = (balances[i] if winner == "b" else -balances[i])
            run = run + 1 if (against >= SAC_MIN_DEFICIT and w >= SAC_MIN_WP) else 0
            if run >= SAC_MIN_PLIES:
                tags.append(f"sac_attack:{winner}")
                break

        if any(w <= SWINDLE_WP for w in late):
            tags.append(f"swindle:{winner}")

    if len(blunders) >= 3:
        tags.append("blunder_fest")

    if result == "1/2-1/2":
        for side in ("w", "b"):
            run = 0
            for _, w in persp(side):
                run = run + 1 if w <= FORTRESS_WP else 0
                if run >= FORTRESS_MIN_PLIES:
                    tags.append(f"fortress:{side}")
                    break

    if game.has_clock:
        for m in moments:
            if m["kind"] not in ("blunder", "mistake"):
                continue
            mv = game.moves[m["ply"] - 1]
            if mv.clk_seconds is not None and mv.clk_seconds < SCRAMBLE_CLK_SECS:
                tags.append("time_scramble")
                break

    return tags
