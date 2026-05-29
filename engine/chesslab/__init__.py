"""Chess Style Lab — canonical, engine-free positional feature engine.

The public surface mirrors CLAUDE.md §6. Import the classes for OO use, or the
functional wrappers for the documented parity contract.
"""

from .catalog import build_default_registry
from .features import (
    PIECE_VALUES,
    Board,
    FeatureEngine,
    Piece,
    PositionFeatures,
    SideFeatures,
    features,
    features_from_fen,
    opposite,
    side_feats,
)
from .registry import (
    Capability,
    Evidence,
    Feature,
    FeatureMeta,
    FeatureRegistry,
    FeatureResult,
    PositionContext,
    Scope,
)

__all__ = [
    "PIECE_VALUES",
    "Board",
    "Capability",
    "Evidence",
    "Feature",
    "FeatureEngine",
    "FeatureMeta",
    "FeatureRegistry",
    "FeatureResult",
    "Piece",
    "PositionContext",
    "PositionFeatures",
    "Scope",
    "SideFeatures",
    "build_default_registry",
    "features",
    "features_from_fen",
    "opposite",
    "side_feats",
]

__version__ = "0.1.0"
