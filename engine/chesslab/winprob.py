"""Win-probability layer — centipawns → expected score, and per-move WP accounting.

Centipawn loss is a poor error metric at the extremes: −300 → −500 is nearly free
while 0 → −200 decides the game. Mapping eval to a win probability (Lichess's
logistic) bounds the trajectory to [0, 1] and makes every drop comparable, which is
what the blunder/mistake thresholds, the state bands (better/equal/worse), the game
archetypes and the story chapters are all built on.

White-perspective throughout; use :func:`perspective` to flip for Black.
"""

from __future__ import annotations

from math import exp
from typing import List, Optional

from .pipeline import ParsedGame

# Lichess's accuracy-model constant: WP = 1 / (1 + e^(-K·cp)).
_WP_K = 0.00368208

# Per-move WP drops (mover's perspective). Mistake is the band below blunder.
BLUNDER_WP = 0.20
MISTAKE_WP = 0.10

# State bands on the mover-perspective WP: better / equal / worse.
BETTER_WP = 0.60
WORSE_WP = 0.40

STATES = ("better", "equal", "worse")


def win_prob(eval_cp: Optional[int], eval_mate: Optional[int]) -> Optional[float]:
    """White's win probability for an eval, or None when no eval is known.

    A mate score is a (near-)certain result regardless of distance.
    """
    if eval_mate is not None:
        return 1.0 if eval_mate > 0 else 0.0
    if eval_cp is None:
        return None
    return 1.0 / (1.0 + exp(-_WP_K * eval_cp))


def perspective(side: str, wp_white: float) -> float:
    """``wp_white`` seen from ``side`` ("w" keeps it, "b" flips it)."""
    return wp_white if side == "w" else 1.0 - wp_white


def state_of(wp_side: float) -> str:
    """Band a side-perspective WP into ``better | equal | worse``."""
    if wp_side >= BETTER_WP:
        return "better"
    if wp_side <= WORSE_WP:
        return "worse"
    return "equal"


def wp_series(game: ParsedGame) -> List[Optional[float]]:
    """White-perspective WP per position (index = ply; [0] = 0.5 for the start).

    Moves without an eval carry the last known WP forward, so the series has no
    holes once an eval has appeared; an eval-less game is 0.5 then None.
    """
    series: List[Optional[float]] = [0.5]
    last: Optional[float] = 0.5 if game.has_eval else None
    if not game.has_eval:
        return [0.5] + [None] * len(game.moves)
    for mv in game.moves:
        wp = win_prob(mv.eval_cp, mv.eval_mate)
        if wp is not None:
            last = wp
        series.append(last)
    return series


def move_drop(side: str, wp_before: Optional[float], wp_after: Optional[float]) -> Optional[float]:
    """The mover's WP loss on one move (floored at 0), or None when WP is unknown."""
    if wp_before is None or wp_after is None:
        return None
    return max(0.0, perspective(side, wp_before) - perspective(side, wp_after))
