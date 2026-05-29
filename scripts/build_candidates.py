"""Build the browsable games library for the web app from the Candidates PGNs.

Reads data/candidates2026/{open,women}/round-*/games.pgn, splits each file into
individual games (python-chess, move-application only), and writes a compact
web/data/candidates2026.json that the frontend fetches. Games with an illegal-SAN
LiveChess glitch are kept up to their legal prefix (python-chess truncates them),
so the in-browser parser never chokes.

Run:  engine/.venv/bin/python scripts/build_candidates.py
"""

from __future__ import annotations

import io
import json
import pathlib
import re

import chess.pgn

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "candidates2026"
OUT = ROOT / "web" / "data" / "candidates2026.json"


def last_name(name: str) -> str:
    return name.split(",")[0].strip() if name else "?"


def main() -> None:
    games = []
    truncated = 0
    seen_ids: set[str] = set()

    for fp in sorted(SRC.glob("*/round-*/games.pgn")):
        tour = fp.parts[-3]  # "open" | "women"
        folder_round = int(fp.parts[-2].split("-")[1])
        stream = io.StringIO(fp.read_text(encoding="utf-8", errors="replace"))
        idx = 0
        while True:
            game = chess.pgn.read_game(stream)
            if game is None:
                break
            if not list(game.mainline_moves()):
                continue
            idx += 1
            h = game.headers
            m = re.match(r"(\d+)(?:\.(\d+))?", h.get("Round", ""))
            rnd = int(m.group(1)) if m else folder_round
            board = int(m.group(2)) if (m and m.group(2)) else idx
            if game.errors:
                truncated += 1

            gid = f"{tour}-r{rnd:02d}-b{board}"
            while gid in seen_ids:  # guard against any round/board collision
                board += 100
                gid = f"{tour}-r{rnd:02d}-b{board}"
            seen_ids.add(gid)

            exporter = chess.pgn.StringExporter(headers=False, variations=False, comments=False)
            pgn = game.accept(exporter).strip()
            white, black, result = h.get("White", "?"), h.get("Black", "?"), h.get("Result", "*")
            games.append({
                "id": gid, "tour": tour, "round": rnd, "board": board,
                "white": white, "black": black,
                "welo": h.get("WhiteElo", ""), "belo": h.get("BlackElo", ""),
                "result": result, "eco": h.get("ECO", ""), "opening": h.get("Opening", ""),
                "date": h.get("Date", ""),
                "label": f"R{rnd}.{board} {last_name(white)}–{last_name(black)} ({result})",
                "pgn": pgn,
            })

    games.sort(key=lambda g: (g["tour"], g["round"], g["board"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"count": len(games), "truncated": truncated, "games": games},
                              separators=(",", ":")))
    print(f"wrote {len(games)} games ({truncated} truncated) -> {OUT}  ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
