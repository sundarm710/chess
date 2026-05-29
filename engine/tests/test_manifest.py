"""features.yaml sync test — the generated manifest must match the committed file.

This guards the single-source-of-truth guarantee: if a feature's metadata changes,
features.yaml must be regenerated (``python -m chesslab.manifest``) or this fails.
"""

import yaml

from chesslab import build_default_registry
from chesslab.manifest import FEATURES_YAML, build_manifest, generate_features_yaml


def test_committed_yaml_matches_registry():
    registry = build_default_registry()
    expected = generate_features_yaml(registry)
    actual = FEATURES_YAML.read_text()
    assert actual == expected, "features.yaml is stale — run `python -m chesslab.manifest`"


def test_yaml_ids_cover_registry():
    registry = build_default_registry()
    records = yaml.safe_load(FEATURES_YAML.read_text())
    yaml_ids = {r["id"] for r in records}
    assert yaml_ids == {f.id for f in registry.all()}


def test_manifest_projection_shape():
    manifest = build_manifest(build_default_registry())
    entry = manifest["MAT.hanging"]
    assert entry["name"] == "Hanging (en prise)"
    assert entry["engine"] == "none"
    assert "description" in entry and "computation" in entry
