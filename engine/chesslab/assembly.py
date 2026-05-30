"""MOVE/GAME assembly features — computed over the move sequence + running state.

These features don't come from a single position, so they live outside the
per-position :class:`~chesslab.features.FeatureEngine`. :class:`MoveAssembler` walks a
game ply by ply, maintaining running counters, and emits one batch of
:class:`~chesslab.registry.FeatureResult` per ply (the orchestrator then computes
deltas and serializes them, exactly like the board features).

Backend-only: not mirrored in the JS engine (CLAUDE.md §14). Capability-gated features
(CLOCK/EVAL) emit ``status=UNAVAILABLE`` with ``value=None`` when the game lacks the
required data, so the UI shows "needs clock/eval data" rather than a misleading number.
"""

from __future__ import annotations

import statistics
from typing import Dict, List, Optional

from .features import Board, FeatureEngine, Piece, PositionFeatures, opposite
from .pipeline import ParsedGame, ParsedMove
from .registry import FeatureResult, ResultStatus

_MINOR_HOME = {
    "w": {(1, 0), (6, 0), (2, 0), (5, 0)},  # b1,g1 (N) ; c1,f1 (B)
    "b": {(1, 7), (6, 7), (2, 7), (5, 7)},
}
_QUEEN_HOME = {"w": (3, 0), "b": (3, 7)}


def _uci_from(uci: str) -> tuple[int, int]:
    """File/rank of a uci move's origin square."""
    return ord(uci[0]) - 97, int(uci[1]) - 1


class MoveAssembler:
    """Stateful per-ply computation of the MOVE/GAME-tier features for one game."""

    def __init__(self, game: ParsedGame) -> None:
        self.game = game
        self.forcing: Dict[str, int] = {"w": 0, "b": 0}
        self.played: Dict[str, int] = {"w": 0, "b": 0}
        self.prophylaxis: Dict[str, int] = {"w": 0, "b": 0}
        self.tempo_waste: Dict[str, int] = {"w": 0, "b": 0}
        self.tension_hold: Dict[str, int] = {"w": 0, "b": 0}
        self.trade: Dict[str, int] = {"w": 0, "b": 0}
        self.exposure: Dict[str, int] = {"w": 0, "b": 0}
        self.move_time: Dict[str, Optional[float]] = {"w": None, "b": None}
        self.clock: Dict[str, Optional[float]] = {"w": None, "b": None}
        self.eval_losses: Dict[str, List[float]] = {"w": [], "b": []}
        self._prev_pf: Optional[PositionFeatures] = None
        self._prev_board: Optional[Board] = None

    def step(self, i: int, board: Board, pf: PositionFeatures) -> List[FeatureResult]:
        """Advance to position ``i`` and return its assembly feature results."""
        game = self.game
        pos = game.positions[i]
        if i >= 1:
            self._update_running(i, pf)
        results = self._emit(i, board, pf)
        self._prev_pf = pf
        self._prev_board = board
        return results

    # -- running counters --------------------------------------------------
    def _update_running(self, i: int, pf: PositionFeatures) -> None:
        game = self.game
        mv = game.moves[i - 1]
        s, o = mv.mover, opposite(mv.mover)
        prev_pf, prev_board = self._prev_pf, self._prev_board

        self.played[s] += 1
        if mv.is_capture or mv.is_check:
            self.forcing[s] += 1

        # Prophylaxis: a quiet move after which the opponent (now to move) has fewer
        # legal replies than the last time it was their turn (2 plies ago).
        if not mv.is_capture and not mv.is_check and i >= 2:
            if game.positions[i].legal_count < game.positions[i - 2].legal_count:
                self.prophylaxis[s] += 1

        # Exposure: the move increased the mover's own en-prise value.
        if prev_pf is not None and getattr(pf, s).hang_val > getattr(prev_pf, s).hang_val:
            self.exposure[s] += 1

        if prev_board is not None and prev_pf is not None:
            if self._is_tempo_waste(mv, s, prev_board, prev_pf):
                self.tempo_waste[s] += 1
            if self._pawn_tension(prev_board, s) and not self._resolves_pawn_tension(mv, prev_board):
                self.tension_hold[s] += 1

        # Trade discipline: capturing while ahead is good (+1), while behind is bad (-1).
        if mv.is_capture and prev_pf is not None:
            balance = getattr(prev_pf, s).mat - getattr(prev_pf, o).mat
            if balance >= 1:
                self.trade[s] += 1
            elif balance <= -1:
                self.trade[s] -= 1

        if mv.clk_seconds is not None:
            self.clock[s] = mv.clk_seconds
        if mv.emt_seconds is not None:
            self.move_time[s] = mv.emt_seconds

        if game.has_eval:
            self._record_eval_loss(i, s)

    def _record_eval_loss(self, i: int, s: str) -> None:
        game = self.game
        after = game.moves[i - 1].eval_cp
        before = 0 if i == 1 else game.moves[i - 2].eval_cp
        if after is None or before is None:
            return  # mate score or missing eval — skip this move
        loss = max(0, before - after) if s == "w" else max(0, after - before)
        self.eval_losses[s].append(float(loss))

    # -- helpers -----------------------------------------------------------
    @staticmethod
    def _is_tempo_waste(mv: ParsedMove, s: str, prev_board: Board, prev_pf: PositionFeatures) -> bool:
        f, r = _uci_from(mv.uci)
        piece: Optional[Piece] = prev_board.piece_at(f, r)
        if piece is None:
            return False
        dev_before = getattr(prev_pf, s).dev
        if piece.type == "q" and (f, r) == _QUEEN_HOME[s] and dev_before < 3:
            return True  # early queen sortie
        if piece.type in ("n", "b") and (f, r) not in _MINOR_HOME[s] and dev_before < 4:
            return True  # re-moving an already-developed minor before development is done
        return False

    @staticmethod
    def _pawn_tension(board: Board, color: str) -> bool:
        opp = opposite(color)
        for f, r, p in board.pieces(color):
            if p.type != "p":
                continue
            for tf, tr in board.attacks_from(f, r):
                target = board.piece_at(tf, tr)
                if target is not None and target.color == opp and target.type == "p":
                    return True
        return False

    @staticmethod
    def _resolves_pawn_tension(mv: ParsedMove, prev_board: Board) -> bool:
        f, r = _uci_from(mv.uci)
        piece = prev_board.piece_at(f, r)
        return piece is not None and piece.type == "p" and mv.is_capture

    # -- per-ply emission --------------------------------------------------
    def _emit(self, i: int, board: Board, pf: PositionFeatures) -> List[FeatureResult]:
        game = self.game
        pos = game.positions[i]
        out: List[FeatureResult] = []

        def add(fid: str, side: str, value: Optional[float], available: bool = True) -> None:
            status = ResultStatus.OK if available else ResultStatus.UNAVAILABLE
            out.append(FeatureResult(fid, side, value if available else None, status=status))

        # Shared, always available.
        add("TAC.density", "shared", float(pos.legal_captures + pos.legal_checks + pf.tension))
        balance = pf.w.mat - pf.b.mat
        prev_balance = (self._prev_pf.w.mat - self._prev_pf.b.mat) if self._prev_pf else balance
        add("MAT.swing", "shared", float(abs(balance - prev_balance)))

        for side in ("w", "b"):
            rate = self.forcing[side] / self.played[side] if self.played[side] else 0.0
            add("DYN.initiative", side, rate)
            add("DEC.prophylaxis", side, float(self.prophylaxis[side]))
            add("DEV.tempo_waste", side, float(self.tempo_waste[side]))
            add("STR.tension_hold", side, float(self.tension_hold[side]))
            add("DEC.trade_discipline", side, float(self.trade[side]))
            add("TAC.exposure", side, float(self.exposure[side]))
            # CLOCK (gated on %clk / %emt presence)
            add("TIM.move_time", side, self.move_time[side], available=game.has_clock)
            add("TIM.clock", side, self.clock[side], available=game.has_clock)
            # EVAL (gated on %eval presence)
            losses = self.eval_losses[side]
            acpl = statistics.fmean(losses) if losses else 0.0
            consistency = statistics.pstdev(losses) if len(losses) >= 2 else 0.0
            add("EVAL.acpl", side, round(acpl, 1), available=game.has_eval)
            add("EVAL.consistency", side, round(consistency, 1), available=game.has_eval)

        return out
