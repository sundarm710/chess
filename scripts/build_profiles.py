"""Build per-tournament player profiles for the frontend.

For each tournament in web/data/library.json: load its games (web/data/t/<slug>.json),
run each through the orchestrator, reduce to a GameSummary, and roll up into a
TournamentProfile → web/data/profiles/<slug>.json (the SPA's profiles contract).

Pure recompute from the committed library; no network. Run after build_library.py:
  engine/.venv/bin/python scripts/build_profiles.py
"""

from __future__ import annotations

import json
import pathlib

from chesslab import build_default_registry
from chesslab.aggregate import summarize, tournament_profile
from chesslab.manifest import build_manifest
from chesslab.orchestrator import Orchestrator
from chesslab.pipeline import parse_pgn

ROOT = pathlib.Path(__file__).resolve().parents[1]
WEB = ROOT / "web" / "data"


def main() -> None:
    registry = build_default_registry()
    orch = Orchestrator(registry)
    manifest = build_manifest(registry)
    version = registry.feature_set_version()

    index = json.loads((WEB / "library.json").read_text())["tournaments"]
    out_dir = WEB / "profiles"
    out_dir.mkdir(parents=True, exist_ok=True)

    for t in index:
        doc = json.loads((WEB / "t" / f"{t['slug']}.json").read_text())
        summaries = []
        skipped = 0
        for g in doc["games"]:
            try:
                analysis = orch.run(parse_pgn(g["pgn"]))
            except Exception as exc:  # a malformed/truncated game shouldn't sink the build
                skipped += 1
                print(f"    skip {g['id']}: {exc}")
                continue
            summaries.append(summarize(analysis, slug=t["slug"], game=g))

        profile = tournament_profile(
            t["slug"], t["label"], summaries, manifest,
            has_clock=t.get("has_clock", False), has_eval=False, feature_set_version=version,
        )
        (out_dir / f"{t['slug']}.json").write_text(json.dumps(profile, separators=(",", ":")))
        print(f"  {t['slug']}: {len(summaries)} games, {len(profile['players'])} players"
              + (f", {skipped} skipped" if skipped else ""))

    print(f"wrote {len(index)} profiles -> {out_dir}")


if __name__ == "__main__":
    main()
