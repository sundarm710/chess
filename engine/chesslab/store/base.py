"""Storage interface for per-game analysis artifacts and (later) the corpus."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

Analysis = Dict[str, Any]


class FeatureStore(ABC):
    """Persists and retrieves a game's analysis (the explainability payload).

    Single-game serving never needs SQL — it reads one denormalized artifact. The
    analytical/corpus backends implement the same interface plus their own query
    methods, so feature/orchestration code depends only on this abstraction.
    """

    @abstractmethod
    def write_game(self, game_id: str, analysis: Analysis) -> str:
        """Persist a game's analysis dict; return a locator (path/key)."""
        raise NotImplementedError

    @abstractmethod
    def read_game(self, game_id: str) -> Optional[Analysis]:
        """Return a previously stored analysis dict, or None if absent."""
        raise NotImplementedError

    @abstractmethod
    def has_game(self, game_id: str) -> bool:
        """Whether an analysis for ``game_id`` exists."""
        raise NotImplementedError
