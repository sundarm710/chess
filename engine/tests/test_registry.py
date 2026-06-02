"""Registry framework tests (Phase 0).

Assert the registry is well-formed and that the BOARD-tier adapters reproduce the
canonical engine values exactly — i.e. re-homing features into the registry changed
no math. These run automatically via the project suite (CLAUDE.md §13).
"""

import pytest

from chesslab import Board, FeatureEngine, build_default_registry
from chesslab.catalog.board import board_features
from chesslab.registry import (
    Capability,
    FeatureMeta,
    FeatureRegistry,
    PositionContext,
    RegistryError,
    Scope,
    scope_rank,
)

from .golden_fens import GOLDEN

ENGINE = FeatureEngine()

# Map each registry feature id to the engine field it must reproduce.
SIDE_FIELD = {
    "MAT.balance": "mat",
    "MAT.hanging": "hang_val",
    "ACT.control": "control",
    "SPC.space": "space",
    "SPC.center_control": "center",
    "DEV.count": "dev",
    "KSF.castle": "castled",
    "KSF.shield": "shield",
    "KSF.zone_pressure": "kp",
}


@pytest.fixture(scope="module")
def registry():
    return build_default_registry()


class TestRegistryStructure:
    def test_builds_and_validates(self, registry):
        # build_default_registry already calls validate(); re-assert idempotency.
        registry.validate()
        assert len(registry) == 44

    def test_scopes(self, registry):
        # Board features are POSITION-scope; the MOVE/GAME assembly features are GAME.
        for f in registry.all():
            assert f.scope in (Scope.POSITION, Scope.GAME)
        assert sum(1 for f in registry.all() if f.scope is Scope.POSITION) == 22
        assert sum(1 for f in registry.all() if f.scope is Scope.GAME) == 22

    def test_position_features_require_no_capabilities(self, registry):
        # The hard wall: no board (POSITION) feature may require eval/clock/ref.
        for feat in registry.all():
            if feat.scope is Scope.POSITION:
                assert feat.requires == frozenset(), f"{feat.id} unexpectedly requires data"
                assert feat.meta.engine == "none"

    def test_ids_sorted_and_unique(self, registry):
        ids = [f.id for f in registry.all()]
        assert ids == sorted(ids)
        assert len(ids) == len(set(ids))

    def test_feature_set_version_is_stable_and_sensitive(self, registry):
        v1 = registry.feature_set_version()
        assert isinstance(v1, str) and len(v1) == 12
        # Same definitions → same version.
        assert build_default_registry().feature_set_version() == v1


class TestRegistryValidation:
    def test_duplicate_id_rejected(self):
        reg = FeatureRegistry()
        feats = board_features()
        reg.register(feats[0])
        with pytest.raises(RegistryError, match="duplicate"):
            reg.register(feats[0])

    def test_unknown_dependency_rejected(self):
        reg = FeatureRegistry()
        feat = board_features()[0]
        object.__setattr__(feat.meta, "depends_on", ("DOES.not_exist",))
        reg.register(feat)
        with pytest.raises(RegistryError, match="unknown feature"):
            reg.validate()

    def test_scope_rank_order(self):
        assert scope_rank(Scope.POSITION) < scope_rank(Scope.MOVE) < scope_rank(Scope.GAME) < scope_rank(Scope.CORPUS)

    def test_incomplete_meta_rejected(self):
        reg = FeatureRegistry()
        bad = board_features()[0]
        object.__setattr__(bad.meta, "name", "")
        reg.register(bad)
        with pytest.raises(RegistryError, match="missing required meta"):
            reg.validate()


class TestAdaptersReproduceEngine:
    """The registry must produce identical numbers to the canonical engine."""

    @pytest.mark.parametrize("fen", list(GOLDEN))
    def test_side_features_match_engine(self, registry, fen):
        ctx = PositionContext(Board.from_fen(fen), fen=fen)
        for fid, field in SIDE_FIELD.items():
            results = {r.side: r.value for r in registry.get(fid).compute(ctx)}
            for side in ("w", "b"):
                expected = float(getattr(getattr(ctx.position_features, side), field))
                assert results[side] == expected, f"{fen} {fid}[{side}]"

    @pytest.mark.parametrize("fen", list(GOLDEN))
    def test_tension_matches_engine(self, registry, fen):
        ctx = PositionContext(Board.from_fen(fen), fen=fen)
        (result,) = registry.get("STR.tension").compute(ctx)
        assert result.side == "shared"
        assert result.value == float(ctx.position_features.tension)

    def test_golden_values_via_registry(self, registry):
        # Cross-check directly against the golden numbers, through the registry path.
        for fen, expected in GOLDEN.items():
            ctx = PositionContext(Board.from_fen(fen), fen=fen)
            if "mat" in expected["w"]:
                w_mat = {r.side: r.value for r in registry.get("MAT.balance").compute(ctx)}["w"]
                assert w_mat == float(expected["w"]["mat"])
            (tension,) = registry.get("STR.tension").compute(ctx)
            assert tension.value == float(expected["tension"])
