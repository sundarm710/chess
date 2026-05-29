"""PGN ingestion pipeline — PGN text → positions + moves.

Uses python-chess for **move application only** (legal-move handling, FEN emission,
SAN) — never for feature math (CLAUDE.md §6/§7). Unlike the JS quick-mode parser,
this one **preserves `%clk` and `%eval`** annotations from move comments, because the
CLOCK/EVAL feature tiers depend on them.
"""

from __future__ import annotations

import hashlib
import io
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import chess
import chess.pgn

from .features import Color

_CLK_RE = re.compile(r"\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]")
_EVAL_RE = re.compile(r"\[%eval\s+(#?-?\d+(?:\.\d+)?)\]")


@dataclass(frozen=True)
class ParsedPosition:
    """A board position at a given ply (0 = start). ``side_to_move`` is whose turn it is.

    The legal-move stats describe the side to move and feed the MOVE/GAME features
    (tactical density, prophylaxis); they're captured here because python-chess
    already has the board in hand."""

    ply: int
    fen: str
    side_to_move: Color
    legal_count: int = 0
    legal_captures: int = 0
    legal_checks: int = 0


@dataclass(frozen=True)
class ParsedMove:
    """One ply: the move played and its annotations. ``ply`` is the position index this
    move produces (1-based). ``clk_seconds``/``eval_cp``/``eval_mate`` are None when the
    PGN lacks `%clk`/`%eval`."""

    ply: int
    san: str
    uci: str
    mover: Color
    is_capture: bool
    is_check: bool
    is_mate: bool
    is_castle: bool
    clk_seconds: Optional[float] = None
    eval_cp: Optional[int] = None
    eval_mate: Optional[int] = None


@dataclass(frozen=True)
class ParsedGame:
    """A fully parsed game: idempotent id, headers, positions, and moves."""

    game_id: str
    headers: Dict[str, str]
    positions: List[ParsedPosition]
    moves: List[ParsedMove]
    result: str
    has_clock: bool
    has_eval: bool

    @property
    def ply_count(self) -> int:
        return len(self.moves)


def game_id_for(pgn: str) -> str:
    """Stable short id for a game (hash of normalized PGN) — idempotent ingestion."""
    normalized = "\n".join(line.strip() for line in pgn.strip().splitlines())
    return hashlib.sha256(normalized.encode()).hexdigest()[:12]


def _parse_clock(comment: str) -> Optional[float]:
    m = _CLK_RE.search(comment)
    if not m:
        return None
    hours, minutes, seconds = int(m.group(1)), int(m.group(2)), float(m.group(3))
    return hours * 3600 + minutes * 60 + seconds


def _parse_eval(comment: str) -> tuple[Optional[int], Optional[int]]:
    """Return (eval_cp, eval_mate). Centipawns for numeric evals; mate distance for `#N`."""
    m = _EVAL_RE.search(comment)
    if not m:
        return None, None
    token = m.group(1)
    if token.startswith("#"):
        return None, int(token[1:])
    return round(float(token) * 100), None


def parse_pgn(pgn: str) -> ParsedGame:
    """Parse the first game in ``pgn`` into a :class:`ParsedGame`."""
    game = chess.pgn.read_game(io.StringIO(pgn))
    if game is None:
        raise ValueError("No game found in PGN.")

    board = game.board()

    def make_position(ply: int) -> ParsedPosition:
        total = caps = checks = 0
        for m in board.legal_moves:
            total += 1
            if board.is_capture(m):
                caps += 1
            if board.gives_check(m):
                checks += 1
        return ParsedPosition(
            ply=ply, fen=board.fen(), side_to_move="w" if board.turn else "b",
            legal_count=total, legal_captures=caps, legal_checks=checks,
        )

    positions: List[ParsedPosition] = [make_position(0)]
    moves: List[ParsedMove] = []
    has_clock = False
    has_eval = False

    node: chess.pgn.GameNode = game
    ply = 0
    while node.variations:
        nxt = node.variation(0)
        move = nxt.move
        assert move is not None
        san = board.san(move)
        mover: Color = "w" if board.turn else "b"
        is_capture = board.is_capture(move)
        is_castle = board.is_castling(move)
        board.push(move)
        ply += 1

        clk = _parse_clock(nxt.comment)
        eval_cp, eval_mate = _parse_eval(nxt.comment)
        has_clock = has_clock or clk is not None
        has_eval = has_eval or eval_cp is not None or eval_mate is not None

        moves.append(
            ParsedMove(
                ply=ply,
                san=san,
                uci=move.uci(),
                mover=mover,
                is_capture=is_capture,
                is_check=board.is_check(),
                is_mate=board.is_checkmate(),
                is_castle=is_castle,
                clk_seconds=clk,
                eval_cp=eval_cp,
                eval_mate=eval_mate,
            )
        )
        positions.append(make_position(ply))
        node = nxt

    if not moves:
        raise ValueError("No moves found in PGN.")

    headers = {k: v for k, v in game.headers.items()}
    return ParsedGame(
        game_id=game_id_for(pgn),
        headers=headers,
        positions=positions,
        moves=moves,
        result=headers.get("Result", "*"),
        has_clock=has_clock,
        has_eval=has_eval,
    )
