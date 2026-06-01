"""MOVE/GAME/CLOCK/EVAL-tier feature definitions (backend-only).

These features are computed over move *transitions* and running game state, not from a
single position, so they live outside the per-position FeatureEngine: the
:class:`~chesslab.assembly.MoveAssembler` (driven by the orchestrator) produces their
per-ply values. The classes here exist so the features appear in the registry /
manifest (and thus the UI) with full metadata; their ``compute`` is never called.

Not mirrored in the JS engine — backend mode only (CLAUDE.md §14). CLOCK features need
PGN ``%clk``/``%emt``; EVAL features need ``%eval`` (or, later, cached cloud-eval).
"""

from __future__ import annotations

from typing import List

from ..registry import Capability, FeatureMeta, FeatureResult, GameContext, GameFeature, Scope


class AssemblyFeature(GameFeature):
    """A GAME-scope feature whose values come from the orchestrator's assembly pass."""

    def __init__(self, meta: FeatureMeta) -> None:
        self.meta = meta

    def compute(self, ctx: GameContext) -> List[FeatureResult]:  # pragma: no cover
        raise NotImplementedError(f"{self.meta.id} is computed by the assembly pass")


def _f(**kw: object) -> AssemblyFeature:
    kw.setdefault("scope", Scope.GAME)
    return AssemblyFeature(FeatureMeta(**kw))  # type: ignore[arg-type]


def move_features() -> List[AssemblyFeature]:
    """Construct the MOVE/GAME/CLOCK/EVAL-tier feature definitions (metadata only)."""
    return [
        _f(
            id="DYN.initiative", name="Initiative", tier="T3", category="DYN",
            inputs="M/G", output_type="rate", viz="trend", higher="good",
            description="How often you dictate play — your share of forcing moves so far.",
            computation="Running fraction of the side's own moves that are captures or checks.",
            saturation="~2400",
        ),
        _f(
            id="DEC.prophylaxis", name="Prophylaxis", tier="T3", category="DEC",
            inputs="M/G", output_type="count", viz="trend", higher="good",
            description="Restricting the opponent — quiet moves that shrink their options.",
            computation="Running count of the side's quiet moves after which the opponent's "
            "legal-move count dropped versus its previous turn.",
            saturation="~2600",
        ),
        _f(
            id="DEC.trade_discipline", name="Trade discipline", tier="T3", category="DEC",
            inputs="M/G", output_type="count", viz="trend", higher="good",
            description="Trading toward safety — simplifying when ahead, avoiding it when behind.",
            computation="Running net: +1 per capture made while ahead (>=+1), -1 while behind (<=-1).",
            saturation="~2300",
        ),
        _f(
            id="DEV.tempo_waste", name="Tempo waste", tier="T1", category="DEV",
            inputs="M/G", output_type="count", viz="trend", higher="bad",
            description="Lost time in the opening — early queen sorties or re-moving already-developed pieces.",
            computation="Running count of opening-phase moves that bring the queen out before 3 "
            "minors are developed, or re-move a developed minor before development is complete "
            "(only counted while the position is still in the opening).",
            saturation="~1700",
        ),
        _f(
            id="STR.tension_hold", name="Tension holding", tier="T3", category="STR",
            inputs="M/G", output_type="count", viz="trend", higher="neutral",
            description="Maturity with pawn tension — declining to resolve pawn captures reflexively.",
            computation="Running count of the side's moves made while an own pawn could capture an "
            "enemy pawn but the side chose not to.",
            saturation="~2500",
        ),
        _f(
            id="TAC.density", name="Tactical density", tier="T2", category="TAC",
            inputs="P/M", output_type="scalar", viz="trend", higher="neutral", aggregation="mean",
            description="How sharp the position is — the volume of forcing options on the board.",
            computation="Legal captures + legal checks available to the side to move, plus board tension.",
            saturation="~2600",
        ),
        _f(
            id="TAC.exposure", name="Exposure events", tier="T0", category="TAC",
            inputs="M/G", output_type="count", viz="trend", higher="bad",
            description="How often you leave material hanging — sacrifices and blunders alike.",
            computation="Running count of the side's moves that increased its own en-prise value.",
            saturation="~2200",
        ),
        _f(
            id="MAT.swing", name="Material swing", tier="T0", category="MAT",
            inputs="M", output_type="scalar", viz="trend", higher="neutral", aggregation="max",
            description="How much material changed hands on this move — volatility.",
            computation="Absolute change in the material balance from the previous position.",
            saturation="~2200",
        ),
        _f(
            id="MAT.deficit", name="Worst deficit", tier="T1", category="MAT",
            inputs="M/G", output_type="scalar", viz="trend", higher="bad", aggregation="max",
            description="The most material the side was *sustainably* behind by — the fight/defence signal.",
            computation="Largest (opponent − own) material gap that held for ≥4 plies (so a "
            "capture/recapture mid-trade doesn't count as a deficit), floored at 0.",
            saturation="—",
        ),
        _f(
            id="MAT.lead", name="Best lead", tier="T1", category="MAT",
            inputs="M/G", output_type="scalar", viz="trend", higher="good", aggregation="max",
            description="The most material the side was *sustainably* ahead by — what they built up.",
            computation="Largest (own − opponent) material gap that held for ≥4 plies (so a "
            "pending recapture doesn't count as a lead), floored at 0.",
            saturation="—",
        ),
        _f(
            id="MAT.on_board", name="Material on board", tier="T1", category="MAT",
            inputs="M/G", output_type="scalar", viz="trend", higher="neutral", aggregation="min",
            description="Total non-king material left on the board — low = simplified.",
            computation="Sum of both sides' material; aggregated as the game minimum (most simplified).",
            saturation="—",
        ),
        _f(
            id="TIM.move_time", name="Move time", tier="T4", category="TIM",
            inputs="K", output_type="scalar", viz="trend", higher="neutral", aggregation="max",
            requires=frozenset({Capability.CLOCK}),
            description="Seconds spent on each side's most recent move (from the clock).",
            computation="The %emt of the side's last move (time spent), carried forward between moves.",
            saturation="~2700",
        ),
        _f(
            id="TIM.clock", name="Clock remaining (low-water)", tier="T4", category="TIM",
            inputs="K", output_type="scalar", viz="trend", higher="neutral", aggregation="min",
            requires=frozenset({Capability.CLOCK}),
            description="Each side's remaining time on the clock; aggregated as the lowest it dropped to (time trouble).",
            computation="The %clk after the side's last move, in seconds; rolled up as the game minimum.",
            saturation="~2700",
        ),
        _f(
            id="TIM.trouble", name="Time-trouble moves", tier="T4", category="TIM",
            inputs="K", output_type="count", viz="trend", higher="bad", aggregation="max",
            requires=frozenset({Capability.CLOCK}),
            description="How many moves the side made with under a minute on the clock.",
            computation="Running count of the side's moves whose %clk was below 60 seconds.",
            saturation="—",
        ),
        _f(
            id="EVAL.acpl", name="Avg centipawn loss", tier="T6", category="EVAL",
            inputs="M/E", output_type="scalar", viz="trend", higher="bad",
            requires=frozenset({Capability.EVAL}),
            description="Average accuracy proxy — mean eval lost per move (lower is better).",
            computation="Running mean of per-move centipawn loss from the side's perspective (needs %eval).",
            saturation="—",
        ),
        _f(
            id="EVAL.consistency", name="Error consistency", tier="T6", category="EVAL",
            inputs="M/E", output_type="scalar", viz="trend", higher="bad",
            requires=frozenset({Capability.EVAL}),
            description="Spread of your errors — low variance late in games is the 2700 signal.",
            computation="Running standard deviation of per-move centipawn loss (needs %eval).",
            saturation="—",
        ),
    ]
