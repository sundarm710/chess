"""Manifest generation — the registry projected to UI manifest + ``features.yaml``.

``features.yaml`` is the single machine-readable source of truth the UI and pipeline
consume; it is GENERATED from the Python registry (never hand-edited), mirroring the
``golden.json`` discipline. A sync test asserts the file matches the registry.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

import yaml

from .catalog import build_default_registry
from .registry import FeatureMeta, FeatureRegistry

# Where the generated manifest lives (consumed by the UI / pipeline).
FEATURES_YAML = Path(__file__).resolve().parent / "features.yaml"


def _meta_record(meta: FeatureMeta) -> Dict[str, Any]:
    """Full registry record for one feature (for features.yaml)."""
    return {
        "id": meta.id,
        "name": meta.name,
        "tier": meta.tier,
        "scope": meta.scope.value,
        "category": meta.category,
        "description": meta.description,
        "computation": meta.computation,
        "inputs": meta.inputs,
        "engine": meta.engine,
        "requires": sorted(c.value for c in meta.requires),
        "output_type": meta.output_type,
        "aggregation": meta.aggregation,
        "normalization": meta.normalization,
        "saturation": meta.saturation,
        "confounders": meta.confounders,
        "depends_on": list(meta.depends_on),
        "residualize_on": meta.residualize_on,
        "status": meta.status,
        "viz": meta.viz,
        "higher": meta.higher,
        "version": meta.version,
    }


def build_manifest(registry: FeatureRegistry) -> Dict[str, Dict[str, Any]]:
    """Compact id→fields map the UI needs to render features (drives table + panel)."""
    manifest: Dict[str, Dict[str, Any]] = {}
    for feat in registry.all():
        m = feat.meta
        manifest[m.id] = {
            "name": m.name,
            "tier": m.tier,
            "scope": m.scope.value,
            "category": m.category,
            "description": m.description,
            "computation": m.computation,
            "output_type": m.output_type,
            "viz": m.viz,
            "engine": m.engine,
            "higher": m.higher,
            "requires": sorted(c.value for c in m.requires),
            "saturation": m.saturation,
        }
    return manifest


def generate_features_yaml(registry: FeatureRegistry) -> str:
    """Render the full registry to a deterministic YAML string."""
    records: List[Dict[str, Any]] = [_meta_record(f.meta) for f in registry.all()]
    header = (
        "# GENERATED from the chesslab feature registry — do not edit by hand.\n"
        "# Regenerate with: python -m chesslab.manifest\n"
    )
    body = yaml.safe_dump(records, sort_keys=False, default_flow_style=False, allow_unicode=True)
    return header + body


def write_features_yaml(registry: FeatureRegistry, path: Path = FEATURES_YAML) -> Path:
    """Write features.yaml from the registry; return the path."""
    path.write_text(generate_features_yaml(registry))
    return path


def main() -> None:
    path = write_features_yaml(build_default_registry())
    print(f"wrote features manifest -> {path}")


if __name__ == "__main__":
    main()
