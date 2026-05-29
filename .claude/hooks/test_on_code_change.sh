#!/usr/bin/env bash
# PostToolUse hook: run the full suite automatically whenever a CODE file changes
# (CLAUDE.md §13 — testing is automatic, not on-demand).
#
# Claude Code pipes the tool-call JSON on stdin. We pull out the edited file path,
# skip non-code edits (docs, json, etc.), and otherwise run ./run_tests.sh. On
# failure we exit 2 so the test output is surfaced back to Claude as feedback.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Extract the edited file path from the hook payload (stdin JSON).
payload="$(cat)"
file_path="$(printf '%s' "$payload" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null || true)"

# Only react to source files; let docs/config edits pass silently.
case "$file_path" in
  *.py|*.js|*.mjs|*.html) ;;
  *) exit 0 ;;
esac

output="$("$ROOT/run_tests.sh" 2>&1)"
status=$?
if [[ $status -ne 0 ]]; then
  echo "Automatic test run FAILED after editing $file_path:" >&2
  echo "$output" >&2
  exit 2
fi
exit 0
