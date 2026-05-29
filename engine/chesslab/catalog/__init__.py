"""Registered feature implementations (the catalog) + the default registry builder.

This package holds the concrete :class:`~chesslab.registry.Feature` classes that fill
out FEATURE_CATALOG.md, organized by scope (``board``, later ``move``/``game``/
``corpus``/``eval``). ``build_default_registry`` assembles and validates them.
"""

from __future__ import annotations

from ..registry import FeatureRegistry
from .board import board_features
from .move import move_features

__all__ = ["build_default_registry"]


def build_default_registry() -> FeatureRegistry:
    """Build and validate the registry with all implemented features registered."""
    registry = FeatureRegistry()
    for bf in board_features():
        registry.register(bf)
    for mf in move_features():
        registry.register(mf)
    registry.validate()
    return registry
