"""Orchestrator — runs the registry over a parsed game into the analysis payload.

Produces the per-ply explainability matrix described in the project plan: for every
position, every (currently POSITION-scope) feature's value, server-computed delta vs
the prior ply, status, and evidence — plus the manifest the UI renders from. This is
the exact JSON the stepper UI consumes, and (for the board tier) the same shape the
offline JS quick mode emits.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any, Dict, List, Optional, Tuple

from .assembly import MoveAssembler
from .features import Board
from .manifest import build_manifest
from .pipeline import ParsedGame
from .registry import (
    Evidence,
    FeatureRegistry,
    FeatureResult,
    PositionContext,
    Scope,
)


def _merge_evidence(evidence: Tuple[Evidence, ...]) -> Dict[str, Any]:
    """Flatten a result's evidence entries into one UI-friendly object."""
    squares: List[str] = []
    pieces: List[str] = []
    layman: List[str] = []
    technical: List[str] = []
    for ev in evidence:
        squares.extend(ev.squares)
        pieces.extend(ev.pieces)
        if ev.note_layman:
            layman.append(ev.note_layman)
        if ev.note_tech:
            technical.append(ev.note_tech)
    return {
        "squares": squares,
        "pieces": pieces,
        "layman": "; ".join(layman),
        "technical": "; ".join(technical),
    }


# Features whose value should never decrease across a game (carry the max forward).
# Castling status: once a side has castled it stays castled even if the king later moves.
STICKY_MAX = {"KSF.castle"}

# Re-exported so callers can keep importing it from the orchestrator (CLAUDE.md §17).
from .phase import classify_phase  # noqa: E402,F401


def _serialize(result: FeatureResult) -> Dict[str, Any]:
    return {
        "id": result.feature_id,
        "side": result.side,
        "value": result.value,
        "delta": result.delta,
        "status": result.status.value,
        "evidence": _merge_evidence(result.evidence),
    }


class Orchestrator:
    """Computes a :class:`ParsedGame` into the analysis dict, in scope+dependency order."""

    def __init__(self, registry: FeatureRegistry) -> None:
        self.registry = registry
        # Position features in topological (dependency) order; higher scopes arrive later.
        self._position_features = registry.by_scope(Scope.POSITION)

    def run(self, game: ParsedGame) -> Dict[str, Any]:
        """Return the full analysis payload for ``game``."""
        plies: List[Dict[str, Any]] = []
        # (feature_id, side) -> last value, for server-side delta computation.
        prev: Dict[Tuple[str, str], Optional[float]] = {}
        assembler = MoveAssembler(game)  # MOVE/GAME running features

        def emit(result: FeatureResult, value: Optional[float]) -> None:
            key = (result.feature_id, result.side)
            pv = prev.get(key)
            delta = value - pv if (value is not None and pv is not None) else None
            feats.append(_serialize(replace(result, value=value, delta=delta)))
            prev[key] = value

        for pos in game.positions:
            ctx = PositionContext(
                Board.from_fen(pos.fen), ply=pos.ply, fen=pos.fen, side_to_move=pos.side_to_move
            )
            feats: List[Dict[str, Any]] = []
            for feature in self._position_features:
                for result in feature.compute(ctx):
                    value = result.value
                    pv = prev.get((result.feature_id, result.side))
                    # Carry the max forward for sticky features (e.g. castled stays yes).
                    if result.feature_id in STICKY_MAX and value is not None and pv is not None and pv > value:
                        value = pv
                    emit(result, value)

            # --- MOVE/GAME assembly features (backend-only) ---
            for result in assembler.step(pos.ply, ctx.board, ctx.position_features):
                emit(result, result.value)

            move = game.moves[pos.ply - 1] if pos.ply > 0 else None
            plies.append(
                {
                    "ply": pos.ply,
                    "fen": pos.fen,
                    "san": move.san if move else None,
                    "uci": move.uci if move else None,  # lets the UI highlight from/to squares
                    "mover": move.mover if move else None,
                    "phase": classify_phase(ctx.board, pos.ply),
                    "features": feats,
                }
            )

        return {
            "game_id": game.game_id,
            "feature_set_version": self.registry.feature_set_version(),
            "headers": game.headers,
            "result": game.result,
            "has_clock": game.has_clock,
            "has_eval": game.has_eval,
            "meta": build_manifest(self.registry),
            "plies": plies,
            "game_features": [],  # GAME/CORPUS scope arrives in later phases
        }
