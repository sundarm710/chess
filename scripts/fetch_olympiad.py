"""Fetch the 46th FIDE Chess Olympiad (Samarkand 2026) from Lichess broadcasts.

The Olympiad has too many boards for one Lichess broadcast, so Lichess splits each
section into several parallel broadcasts (Open I-V, Women I-IV), each running all 11
rounds. This script pulls every sub-broadcast's per-round PGN export (already carries
Lichess's live engine `%eval` plus `%clk`) and concatenates same-round-number files
into one `games.pgn` per round per section, matching the `data/raw/<slug>/<section>/
round-NN/games.pgn` "dir" layout `build_library.py` expects (CLAUDE.md §16).

Round ids are permanent once Lichess creates the round page (even empty, unplayed
rounds exist as stubs), so the manifest below is stable for the whole event. Re-run
this script any time to pull the latest moves for rounds already underway, then re-run
`build_library.py` (and `build_profiles.py`) to refresh the app's data.

Usage:
    engine/.venv/bin/python scripts/fetch_olympiad.py
"""

from __future__ import annotations

import io
import time
import urllib.request
from pathlib import Path

import chess.pgn

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "olympiad2026"

USER_AGENT = "chess-style-lab/1.0 (+https://github.com/sundarm710/chess)"
REQUEST_DELAY_S = 1.0

# slug -> {round_number: round_id}, collected from each sub-broadcast's round list.
SECTIONS: dict[str, dict[str, dict[int, str]]] = {
    "open": {
        "46th-fide-chess-olympiad-samarkand-2026-open-i": {
            1: "DfnuMSan", 2: "HnCuRMmB", 3: "bmI956uk", 4: "1utZ8Vrx", 5: "6XsrFkyQ",
            6: "QPxrBgKF", 7: "9l2TSddv", 8: "e1YOXXb1", 9: "oQds2Dcv", 10: "WCYaLfnP",
            11: "QJSVWmNu",
        },
        "46th-fide-chess-olympiad-samarkand-2026-open-ii": {
            1: "aJJ3Lq0n", 2: "QWywZUqa", 3: "3xi4XaHj", 4: "4jRpiO1R", 5: "05Y8xn7K",
            6: "WiHr7bTL", 7: "FjruJyu1", 8: "AOl4fXfr", 9: "K9dy4GOx", 10: "ztF7mWwC",
            11: "smkNzAAT",
        },
        "46th-fide-chess-olympiad-samarkand-2026-open-iii": {
            1: "2LDkjZrv", 2: "OTXouHZ4", 3: "2AXTowkr", 4: "XPH2bJ4V", 5: "bGzYQinq",
            6: "pTXF5xxG", 7: "uVLbX9CD", 8: "54Po8Kjq", 9: "Q4buVNG5", 10: "OGxbdDXP",
            11: "sfHUopgP",
        },
        "46th-fide-chess-olympiad-samarkand-2026-open-iv": {
            1: "ujxBFvlN", 2: "iXV4gsEb", 3: "F18NvdBq", 4: "1U87L2sb", 5: "o5sehMCA",
            6: "nVsKUUmo", 7: "SegFraAl", 8: "WculDCVL", 9: "QOhg6O2E", 10: "0tWyDtvv",
            11: "nmvlNu2X",
        },
        "46th-fide-chess-olympiad-samarkand-2026-open-v": {
            1: "B2BIs1MS", 2: "1FqAo1rM", 3: "MrGbsWWU", 4: "qBGGiwfo", 5: "JqG93N2H",
            6: "HtZue9p8", 7: "LdVcE9SD", 8: "SuD0awaS", 9: "6v1ww7QS", 10: "6R1yCJva",
            11: "Ya8JY9GZ",
        },
    },
    "women": {
        "46th-fide-chess-olympiad-samarkand-2026-women-i": {
            1: "XHgEsfxN", 2: "SnyTUPmk", 3: "VzILBdZC", 4: "2hYX8RYf", 5: "Hnhu4swz",
            6: "AQ4HOi0E", 7: "qMc4guBH", 8: "aBkh1Bv5", 9: "edZfnhoA", 10: "BQmH5Kuj",
            11: "mcDuUC43",
        },
        "46th-fide-chess-olympiad-samarkand-2026-women-ii": {
            1: "faTHHBJT", 2: "w05UGgZS", 3: "M9OAGT0y", 4: "6A6YObUj", 5: "AxZ8MZOX",
            6: "S9n2EDaS", 7: "mGxLUF2P", 8: "G8sxdHKP", 9: "kOepClW9", 10: "fiW73Frw",
            11: "71kYNK09",
        },
        "46th-fide-chess-olympiad-samarkand-2026-women-iii": {
            1: "QLkIOQAo", 2: "cuZVJIFg", 3: "lw8VIuPv", 4: "eQgvWnRa", 5: "WrjA9fsb",
            6: "nSuPxULH", 7: "I2ofl2zh", 8: "yz4xelsb", 9: "I2JVNGL4", 10: "2YzS2Zrx",
            11: "bxx9OQk5",
        },
        "46th-fide-chess-olympiad-samarkand-2026-women-iv": {
            1: "uWx7jJZP", 2: "Y3nlhYiE", 3: "dZJFnRft", 4: "rUkouVR7", 5: "ifGT8E48",
            6: "IWoo1J5j", 7: "UN7hnvg8", 8: "nNSiu2uI", 9: "t5tPdiIe", 10: "A9AhPlcS",
            11: "zwtIOEd2",
        },
    },
}


def _fetch_round_pgn(round_id: str) -> str:
    url = f"https://lichess.org/api/broadcast/round/{round_id}.pgn"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req) as resp:
        return resp.read().decode("utf-8")


def _has_moves(pgn_text: str) -> bool:
    stream = io.StringIO(pgn_text)
    while True:
        game = chess.pgn.read_game(stream)
        if game is None:
            return False
        if len(list(game.mainline_moves())) > 0:
            return True


def fetch_section(section: str, sub_broadcasts: dict[str, dict[int, str]]) -> None:
    out_dir = RAW / section
    out_dir.mkdir(parents=True, exist_ok=True)
    max_round = max(r for rounds in sub_broadcasts.values() for r in rounds)

    for round_num in range(1, max_round + 1):
        chunks = []
        for slug, rounds in sub_broadcasts.items():
            round_id = rounds.get(round_num)
            if round_id is None:
                continue
            pgn_text = _fetch_round_pgn(round_id)
            time.sleep(REQUEST_DELAY_S)
            if _has_moves(pgn_text):
                chunks.append(pgn_text.strip())
        round_dir = out_dir / f"round-{round_num:02d}"
        if not chunks:
            print(f"  {section} round {round_num}: no games yet, skipping")
            continue
        round_dir.mkdir(parents=True, exist_ok=True)
        (round_dir / "games.pgn").write_text("\n\n".join(chunks) + "\n")
        n_games = sum(c.count("[Event ") for c in chunks)
        print(f"  {section} round {round_num}: {n_games} games from {len(chunks)} sub-broadcasts")


def main() -> None:
    for section, sub_broadcasts in SECTIONS.items():
        print(f"{section}:")
        fetch_section(section, sub_broadcasts)


if __name__ == "__main__":
    main()
