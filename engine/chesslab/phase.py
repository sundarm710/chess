"""Game-phase classification (CLAUDE.md §17).

A position is opening / middlegame / endgame by a material+move hybrid: a tapered
material value with a move-number opening gate. Kept in its own module so both the
orchestrator (per-ply tagging) and the assembler (phase-gated MOVE features) can use it
without a circular import.
"""

from __future__ import annotations

from .features import Board

# Tapered material weight (both colours summed): minors=1, rooks=2, queens=4.
# Start position = 4 minors + 4 rooks + 2 queens = 4 + 8 + 8 = 24.
_PHASE_WEIGHT = {"n": 1, "b": 1, "r": 2, "q": 4}
OPENING_MAX_MOVE = 12   # opening only within the first 12 moves (ply <= 24)...
OPENING_MIN_PHASE = 20  # ...and only while most material is still on the board
ENDGAME_MAX_PHASE = 8   # endgame once heavy material is largely gone (queens off-ish)


def phase_value(board: Board) -> int:
    """Tapered material units left on the board (0..24)."""
    return sum(_PHASE_WEIGHT.get(p.type, 0) for _, _, p in board.pieces())


def classify_phase(board: Board, ply: int) -> str:
    """Classify a position as ``"opening" | "middlegame" | "endgame"``.

    Opening takes precedence, then endgame, else middlegame.
    """
    move_number = (ply + 1) // 2  # ply 0 (start) -> move 0
    pv = phase_value(board)
    if move_number <= OPENING_MAX_MOVE and pv >= OPENING_MIN_PHASE:
        return "opening"
    if pv <= ENDGAME_MAX_PHASE:
        return "endgame"
    return "middlegame"


def is_opening(board: Board, ply: int) -> bool:
    """Whether the position is in the opening phase."""
    return classify_phase(board, ply) == "opening"
