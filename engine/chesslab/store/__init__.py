"""Pluggable storage for analysis results.

The :class:`FeatureStore` interface lets the rest of the system stay storage-agnostic.
We ship :class:`FileFeatureStore` (per-game JSON artifacts) for single-game serving;
a ``DuckDBFeatureStore`` (Parquet facts + SQL) arrives with the corpus phase, and a
Postgres backend can follow — none of it touching feature code.
"""

from .base import FeatureStore
from .file_store import FileFeatureStore

__all__ = ["FeatureStore", "FileFeatureStore"]
