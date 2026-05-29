"""MOVE/GAME-tier feature definitions (backend-only).

These features are computed over move *transitions* and running game state, not from
a single position, so they live outside the per-position FeatureEngine: the
:class:`~chesslab.orchestrator.Orchestrator` computes them in an assembly pass using
the move sequence and per-position legal-move stats captured by the pipeline.

The classes here exist so the features appear in the registry / manifest (and thus the
UI) with full metadata; their ``compute`` is never called (the orchestrator handles
them). They are NOT mirrored in the JS engine — backend mode only (CLAUDE.md §14).
"""

from __future__ import annotations

from typing import List

from ..registry import FeatureMeta, GameFeature, GameContext, FeatureResult, Scope


class AssemblyFeature(GameFeature):
    """A GAME-scope feature whose values are produced by the orchestrator's assembly
    pass rather than a per-position computation."""

    def __init__(self, meta: FeatureMeta) -> None:
        self.meta = meta

    def compute(self, ctx: GameContext) -> List[FeatureResult]:  # pragma: no cover
        raise NotImplementedError(f"{self.meta.id} is computed by the orchestrator assembly pass")


# Ids the orchestrator's assembly pass knows how to compute, in emit order.
ASSEMBLY_IDS = ("DYN.initiative", "TAC.density", "DEC.prophylaxis")


def move_features() -> List[AssemblyFeature]:
    """Construct the MOVE/GAME-tier feature definitions (metadata only)."""
    return [
        AssemblyFeature(
            FeatureMeta(
                id="DYN.initiative", name="Initiative", tier="T3", scope=Scope.GAME,
                category="DYN", inputs="M/G", output_type="rate", viz="trend", higher="good",
                description="How often you dictate play — your share of forcing moves so far.",
                computation="Running fraction of the side's own moves that are captures or checks.",
                saturation="~2400",
            )
        ),
        AssemblyFeature(
            FeatureMeta(
                id="TAC.density", name="Tactical density", tier="T2", scope=Scope.GAME,
                category="TAC", inputs="P/M", output_type="scalar", viz="trend", higher="neutral",
                description="How sharp the position is — the volume of forcing options on the board.",
                computation="Legal captures + legal checks available to the side to move, plus board tension.",
                saturation="~2600",
            )
        ),
        AssemblyFeature(
            FeatureMeta(
                id="DEC.prophylaxis", name="Prophylaxis", tier="T3", scope=Scope.GAME,
                category="DEC", inputs="M/G", output_type="count", viz="trend", higher="good",
                description="Restricting the opponent — quiet moves that shrink their options.",
                computation="Running count of the side's quiet moves after which the opponent's legal-move "
                "count dropped versus its previous turn.",
                saturation="~2600",
            )
        ),
    ]
