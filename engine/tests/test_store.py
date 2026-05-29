"""FeatureStore tests — the storage abstraction the pipeline persists analysis to."""

import pytest

from chesslab.store import FileFeatureStore


class TestFileFeatureStore:
    def test_round_trip(self, tmp_path):
        store = FileFeatureStore(tmp_path)
        analysis = {"game_id": "abc123", "plies": [{"ply": 0}], "feature_set_version": "deadbeef"}
        assert not store.has_game("abc123")
        locator = store.write_game("abc123", analysis)
        assert locator.endswith("abc123.json")
        assert store.has_game("abc123")
        assert store.read_game("abc123") == analysis

    def test_missing_game_returns_none(self, tmp_path):
        assert FileFeatureStore(tmp_path).read_game("nope") is None

    def test_rejects_unsafe_game_id(self, tmp_path):
        store = FileFeatureStore(tmp_path)
        for bad in ("../escape", "a/b", "", ".", ".."):
            with pytest.raises(ValueError):
                store.write_game(bad, {})
