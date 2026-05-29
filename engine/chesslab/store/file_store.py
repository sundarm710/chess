"""File-backed feature store: one JSON artifact per game.

The default backend for single-game serving. Artifacts live under
``<root>/analysis/<game_id>.json``; reading is a single file load (no SQL), which
is exactly what the stepper UI needs.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from .base import Analysis, FeatureStore


class FileFeatureStore(FeatureStore):
    """Stores analysis dicts as pretty-printed JSON files keyed by game id."""

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root)
        self._dir = self.root / "analysis"

    def _path(self, game_id: str) -> Path:
        # game_id is a content hash (safe filename); guard against path tricks anyway.
        if "/" in game_id or "\\" in game_id or game_id in ("", ".", ".."):
            raise ValueError(f"invalid game_id: {game_id!r}")
        return self._dir / f"{game_id}.json"

    def write_game(self, game_id: str, analysis: Analysis) -> str:
        self._dir.mkdir(parents=True, exist_ok=True)
        path = self._path(game_id)
        path.write_text(json.dumps(analysis, indent=2, sort_keys=True) + "\n")
        return str(path)

    def read_game(self, game_id: str) -> Optional[Analysis]:
        path = self._path(game_id)
        if not path.exists():
            return None
        data: Analysis = json.loads(path.read_text())
        return data

    def has_game(self, game_id: str) -> bool:
        return self._path(game_id).exists()
