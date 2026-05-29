"""BOARD-tier feature adapters — thin wrappers over the canonical engine.

These are the 10 features already implemented in :mod:`chesslab.features`, re-homed
as registry entries. They do NOT re-implement any math: each reads a field off the
engine's cached :class:`~chesslab.features.PositionFeatures` bundle, so the parity
invariant (JS == Python on golden FENs) is untouched. Richer per-square evidence is
added in a later phase; here evidence is minimal.
"""

from __future__ import annotations

from typing import List

from ..registry import (
    Capability,
    Evidence,
    FeatureMeta,
    FeatureResult,
    PositionContext,
    PositionFeature,
    Scope,
)

_SIDES = ("w", "b")


class SideScalarBoardFeature(PositionFeature):
    """A per-side feature whose value is one field of ``SideFeatures``."""

    def __init__(self, meta: FeatureMeta, field: str) -> None:
        self.meta = meta
        self._field = field

    def compute(self, ctx: PositionContext) -> List[FeatureResult]:
        pf = ctx.position_features
        results: List[FeatureResult] = []
        for side in _SIDES:
            value = float(getattr(getattr(pf, side), self._field))
            results.append(FeatureResult(self.meta.id, side, value))
        return results


class HangingBoardFeature(PositionFeature):
    """Per-side hanging material: value = summed en-prise value, with the piece count
    carried as evidence (both come straight from the engine — no new math)."""

    def __init__(self, meta: FeatureMeta) -> None:
        self.meta = meta

    def compute(self, ctx: PositionContext) -> List[FeatureResult]:
        pf = ctx.position_features
        results: List[FeatureResult] = []
        for side in _SIDES:
            sf = getattr(pf, side)
            note = f"{sf.hang_ct} piece(s) en prise worth {sf.hang_val}"
            ev = (Evidence(note_tech=note),) if sf.hang_ct else ()
            results.append(FeatureResult(self.meta.id, side, float(sf.hang_val), evidence=ev))
        return results


class SharedScalarBoardFeature(PositionFeature):
    """A board-wide (not per-side) feature, e.g. tension."""

    def __init__(self, meta: FeatureMeta, attr: str) -> None:
        self.meta = meta
        self._attr = attr

    def compute(self, ctx: PositionContext) -> List[FeatureResult]:
        value = float(getattr(ctx.position_features, self._attr))
        return [FeatureResult(self.meta.id, "shared", value)]


def board_features() -> List[PositionFeature]:
    """Construct the 10 BOARD-tier features (CLAUDE.md §6) as registry entries."""
    return [
        SideScalarBoardFeature(
            FeatureMeta(
                id="MAT.balance", name="Material", tier="T0", scope=Scope.POSITION,
                category="MAT", inputs="P", output_type="per-side", viz="trend",
                description="Total material each side has on the board.",
                computation="Sum of piece values per side (P1 N3 B3 R5 Q9, K0).",
                saturation="—",
            ),
            "mat",
        ),
        HangingBoardFeature(
            FeatureMeta(
                id="MAT.hanging", name="Hanging (en prise)", tier="T0", scope=Scope.POSITION,
                category="MAT", inputs="P", output_type="per-side", viz="board",
                description="How much of your own material is sitting undefended under attack.",
                computation="Per non-king piece: attacked AND (undefended OR cheapest "
                "attacker value < piece value); sum the values (count carried as evidence).",
                saturation="~2000",
            ),
        ),
        SideScalarBoardFeature(
            FeatureMeta(
                id="ACT.control", name="Board control", tier="T1", scope=Scope.POSITION,
                category="ACT", inputs="P", output_type="per-side", viz="trend",
                description="How many squares your pieces attack — raw activity.",
                computation="Count of the 64 squares attacked by >=1 of the side's pieces.",
                saturation="~1800",
            ),
            "control",
        ),
        SideScalarBoardFeature(
            FeatureMeta(
                id="SPC.space", name="Space", tier="T2", scope=Scope.POSITION,
                category="SPC", inputs="P", output_type="per-side", viz="trend",
                description="Territory you control in the opponent's half.",
                computation="Controlled squares in the opponent's half (W: rank>=5, B: rank<=4).",
                saturation="~2200",
            ),
            "space",
        ),
        SideScalarBoardFeature(
            FeatureMeta(
                id="SPC.center_control", name="Center control", tier="T1", scope=Scope.POSITION,
                category="SPC", inputs="P", output_type="per-side", viz="trend",
                description="Pressure you exert on the four central squares.",
                computation="Sum of the side's attackers over {d4, e4, d5, e5}.",
                saturation="~1500",
            ),
            "center",
        ),
        SideScalarBoardFeature(
            FeatureMeta(
                id="DEV.count", name="Developed minors", tier="T1", scope=Scope.POSITION,
                category="DEV", inputs="P", output_type="per-side", viz="trend",
                description="How many knights and bishops you've brought off their home squares.",
                computation="Knights+bishops NOT on their home squares (b1/g1/c1/f1; b8/g8/c8/f8).",
                saturation="~1600",
            ),
            "dev",
        ),
        SideScalarBoardFeature(
            FeatureMeta(
                id="KSF.in_check", name="In check", tier="T0", scope=Scope.POSITION,
                category="KSF", inputs="P", output_type="per-side", viz="board",
                description="Whether your king is under attack right now.",
                computation="1 if the side's king square is attacked by an enemy piece, else 0.",
                saturation="~1000",
            ),
            "in_check",
        ),
        SideScalarBoardFeature(
            FeatureMeta(
                id="KSF.castle", name="Castled", tier="T1", scope=Scope.POSITION,
                category="KSF", inputs="P", output_type="per-side", viz="trend",
                description="Whether the king has castled to safety.",
                computation="1 if the king is off its home square and on the g- or c-file, else 0.",
                saturation="~1700",
            ),
            "castled",
        ),
        SideScalarBoardFeature(
            FeatureMeta(
                id="KSF.shield", name="King pawn shield", tier="T2", scope=Scope.POSITION,
                category="KSF", inputs="P", output_type="per-side", viz="board",
                description="Pawns sheltering your king from the front.",
                computation="Own pawns on the <=3 files around the king, within 2 ranks in front.",
                saturation="~2400",
            ),
            "shield",
        ),
        SideScalarBoardFeature(
            FeatureMeta(
                id="KSF.zone_pressure", name="King-zone pressure", tier="T2", scope=Scope.POSITION,
                category="KSF", inputs="P", output_type="per-side", viz="board",
                description="How heavily the enemy attacks the squares around your king (lower is safer).",
                computation="Sum of enemy attacker counts over the king square + its 8 neighbors.",
                saturation="~2400",
            ),
            "kp",
        ),
        SideScalarBoardFeature(
            FeatureMeta(
                id="SPC.center_occ", name="Center occupation", tier="T1", scope=Scope.POSITION,
                category="SPC", inputs="P", output_type="per-side", viz="trend",
                description="Pawns or pieces you physically park on the four central squares.",
                computation="Count of own pieces/pawns occupying {d4, e4, d5, e5}.",
                saturation="~1500",
            ),
            "center_occ",
        ),
        SideScalarBoardFeature(
            FeatureMeta(
                id="STR.islands", name="Pawn islands", tier="T2", scope=Scope.POSITION,
                category="STR", inputs="P", output_type="per-side", viz="trend",
                description="How fragmented your pawns are — fewer islands is healthier.",
                computation="Number of groups of pawns on consecutive files.",
                saturation="~2200",
            ),
            "islands",
        ),
        SideScalarBoardFeature(
            FeatureMeta(
                id="STR.isolated", name="Isolated pawns", tier="T2", scope=Scope.POSITION,
                category="STR", inputs="P", output_type="per-side", viz="trend",
                description="Pawns with no friendly pawn beside them — chronic weaknesses.",
                computation="Pawns with no friendly pawn on either adjacent file.",
                saturation="~2300",
            ),
            "isolated",
        ),
        SideScalarBoardFeature(
            FeatureMeta(
                id="STR.doubled", name="Doubled pawns", tier="T2", scope=Scope.POSITION,
                category="STR", inputs="P", output_type="per-side", viz="trend",
                description="Extra pawns stacked on the same file — they can't defend each other.",
                computation="Sum over files of (pawns_on_file - 1) for files with >1 pawn.",
                saturation="~2300",
            ),
            "doubled",
        ),
        SideScalarBoardFeature(
            FeatureMeta(
                id="STR.passed", name="Passed pawns", tier="T2", scope=Scope.POSITION,
                category="STR", inputs="P", output_type="per-side", viz="trend",
                description="Pawns with a clear run to promotion — a major endgame asset.",
                computation="Pawns with no enemy pawn ahead on the same or adjacent files.",
                saturation="~2400",
            ),
            "passed",
        ),
        SideScalarBoardFeature(
            FeatureMeta(
                id="ACT.rook_open", name="Rooks on open files", tier="T2", scope=Scope.POSITION,
                category="ACT", inputs="P", output_type="per-side", viz="trend",
                description="Rooks standing on files unobstructed by your own pawns.",
                computation="Count of own rooks on files with no own pawn (open or semi-open).",
                saturation="~2300",
            ),
            "rook_open",
        ),
        SideScalarBoardFeature(
            FeatureMeta(
                id="ACT.mobility", name="Piece mobility", tier="T3", scope=Scope.POSITION,
                category="ACT", inputs="P", output_type="per-side", viz="trend",
                description="How many squares your pieces can act on — true activity, not piece count.",
                computation="Sum over own pieces of attacked squares not occupied by an own piece.",
                saturation="~2400",
            ),
            "mobility",
        ),
        SideScalarBoardFeature(
            FeatureMeta(
                id="ACT.outpost", name="Knight outposts", tier="T3", scope=Scope.POSITION,
                category="ACT", inputs="P", output_type="per-side", viz="board",
                description="Knights parked on unassailable squares in enemy territory.",
                computation="Own knights in the enemy half, defended by an own pawn, with "
                "no enemy pawn on an adjacent file able to advance and challenge them.",
                saturation="~2500",
            ),
            "outpost",
        ),
        SideScalarBoardFeature(
            FeatureMeta(
                id="ACT.bishop_quality", name="Bishop quality", tier="T3", scope=Scope.POSITION,
                category="ACT", inputs="P", output_type="per-side", viz="trend",
                description="Good vs bad bishop — high when your bishops aren't hemmed in by your own pawns.",
                computation="Sum over own bishops of mobility / (1 + own pawns on the bishop's color complex).",
                saturation="~2500",
            ),
            "bishop_quality",
        ),
        SideScalarBoardFeature(
            FeatureMeta(
                id="ACT.coordination", name="Coordination", tier="T3", scope=Scope.POSITION,
                category="ACT", inputs="P", output_type="per-side", viz="trend",
                description="How many of your pieces back each other up — force harmony.",
                computation="Count of own non-king pieces defended by at least one own piece.",
                saturation="~2400",
            ),
            "coordination",
        ),
        SideScalarBoardFeature(
            FeatureMeta(
                id="STR.colour_complex", name="Colour-complex control", tier="T3", scope=Scope.POSITION,
                category="STR", inputs="P", output_type="per-side", viz="trend",
                description="Which square colour you dominate (+ light, − dark).",
                computation="Controlled light squares minus controlled dark squares.",
                saturation="~2500",
            ),
            "colour_complex",
        ),
        SharedScalarBoardFeature(
            FeatureMeta(
                id="STR.tension", name="Tension", tier="T2", scope=Scope.POSITION,
                category="STR", inputs="P", output_type="scalar", viz="trend",
                description="Unresolved contact — pieces/pawns at once attacked by the enemy and defended.",
                computation="Count of occupied squares simultaneously attacked by the enemy "
                "AND defended by the owner.",
                saturation="~2600",
            ),
            "tension",
        ),
    ]
