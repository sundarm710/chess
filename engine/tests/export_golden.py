"""Export the golden corpus to JSON so the JS parity runner checks identical numbers.

Run via the test runner; writes ``web/test/golden.json``. Keeping one source
(``golden_fens.GOLDEN``) and generating the JS-side fixture prevents the two
languages from drifting (CLAUDE.md §3, §13).
"""

import json
import pathlib

from golden_fens import GOLDEN  # type: ignore[import-not-found]

_OUT = pathlib.Path(__file__).resolve().parents[2] / "web" / "test" / "golden.json"


def main() -> None:
    _OUT.parent.mkdir(parents=True, exist_ok=True)
    _OUT.write_text(json.dumps(GOLDEN, indent=2, sort_keys=True) + "\n")
    print(f"wrote {len(GOLDEN)} golden positions -> {_OUT}")


if __name__ == "__main__":
    main()
