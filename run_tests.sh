#!/usr/bin/env bash
# One command runs the whole suite (CLAUDE.md §13). The PostToolUse hook and CI
# both call this. Steps:
#   1. Python golden + unit tests (the source of truth)
#   2. export the golden corpus to web/test/golden.json
#   3. JS golden + parity check against that same corpus
#
# Fast and dependency-light so it can run on every code edit. Exits non-zero if
# any step fails.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE="$ROOT/engine"

# Prefer the project venv if present, else fall back to python3 on PATH.
if [[ -x "$ENGINE/.venv/bin/python" ]]; then
  PY="$ENGINE/.venv/bin/python"
else
  PY="python3"
fi

echo "== Generate feature manifest -> chesslab/features.yaml =="
(cd "$ENGINE" && "$PY" -m chesslab.manifest)

echo "== Python tests =="
(cd "$ENGINE" && "$PY" -m pytest)

echo "== Export golden corpus -> web/test/golden.json =="
(cd "$ENGINE/tests" && "$PY" export_golden.py)

echo "== JS module resolution =="
node "$ROOT/web/test/modules.test.mjs"

echo "== JS parser unit tests =="
node "$ROOT/web/test/parser.test.mjs"

echo "== JS analysis builder tests =="
node "$ROOT/web/test/analysis.test.mjs"

echo "== JS games library =="
node "$ROOT/web/test/library.test.mjs"

echo "== JS parity =="
node "$ROOT/web/test/parity.mjs"

echo "== all green =="
