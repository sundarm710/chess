"""Build the browsable games library from data/raw/.

Pipeline:  data/raw/<source>  →  data/tournaments/<slug>/round-NN.pgn  (extracted,
clocks preserved)  →  web/data/library.json (index) + web/data/t/<slug>.json (games).

The frontend lazy-loads: it reads the small index for the first filter (tournament ·
section), then fetches one tournament file for the round/game filter. Game ids are
`<slug>__r<RR>b<BB>` so the slug is recoverable from the id (for deep links).

SOURCES is the hardcoded manifest mapping each raw source to its metadata
(tournament, year, section, format). Add a tournament by dropping its PGN under
data/raw/ and adding a row here. See CLAUDE.md §16.

Run:  engine/.venv/bin/python scripts/build_library.py
"""

from __future__ import annotations

import io
import json
import pathlib
import re

import chess.pgn

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
TOURN = ROOT / "data" / "tournaments"
WEB = ROOT / "web" / "data"

# --- hardcoded source manifest (CLAUDE.md §16) ---------------------------------
SOURCES = [
    {"slug": "candidates-2026-open", "tournament": "FIDE Candidates", "year": 2026,
     "section": "open", "format": "round-robin", "kind": "dir", "path": "candidates2026/open"},
    {"slug": "candidates-2026-women", "tournament": "FIDE Candidates", "year": 2026,
     "section": "women", "format": "round-robin", "kind": "dir", "path": "candidates2026/women"},
    {"slug": "grand-swiss-2025", "tournament": "FIDE Grand Swiss", "year": 2025,
     "section": "open", "format": "swiss", "kind": "file", "path": "fidegrandsw25.pgn"},
    {"slug": "norway-chess-2026", "tournament": "Norway Chess", "year": 2026,
     "section": "open", "format": "round-robin", "kind": "file", "path": "norway26.pgn"},
]

def _export(game, headers: bool) -> str:
    # A FRESH exporter per call — StringExporter accumulates across accept() calls.
    return game.accept(chess.pgn.StringExporter(headers=headers, variations=False, comments=True))


def _last(name: str) -> str:
    return name.split(",")[0].strip() if name else "?"


def _iter_games(src: dict):
    base = RAW / src["path"]
    files = sorted(base.glob("round-*/games.pgn")) if src["kind"] == "dir" else [base]
    for fp in files:
        stream = io.StringIO(fp.read_text(encoding="utf-8", errors="replace"))
        while True:
            game = chess.pgn.read_game(stream)
            if game is None:
                break
            if list(game.mainline_moves()):
                yield game


def _round_board(headers, board_counter: dict) -> tuple[int, int]:
    m = re.match(r"(\d+)(?:\.(\d+))?", headers.get("Round", ""))
    rnd = int(m.group(1)) if m else 1
    if m and m.group(2):
        return rnd, int(m.group(2))
    board_counter[rnd] = board_counter.get(rnd, 0) + 1
    return rnd, board_counter[rnd]


def build_source(src: dict) -> dict:
    """Extract one source: write per-round PGNs and return the per-tournament library dict."""
    out_dir = TOURN / src["slug"]
    out_dir.mkdir(parents=True, exist_ok=True)
    section_title = src["section"].capitalize()
    label = f"{src['tournament']} {src['year']} — {section_title}"

    board_counter: dict = {}
    by_round: dict = {}
    games = []
    truncated = 0

    for game in _iter_games(src):
        h = game.headers
        rnd, board = _round_board(h, board_counter)
        if game.errors:
            truncated += 1
        pgn = _export(game, headers=False).strip()
        white, black, result = h.get("White", "?"), h.get("Black", "?"), h.get("Result", "*")
        gid = f"{src['slug']}__r{rnd:02d}b{board:02d}"
        rec = {
            "id": gid, "round": rnd, "board": board,
            "white": white, "black": black,
            "welo": h.get("WhiteElo", ""), "belo": h.get("BlackElo", ""),
            "result": result, "eco": h.get("ECO", ""), "opening": h.get("Opening", ""),
            "label": f"R{rnd}.{board} {_last(white)}–{_last(black)} ({result})",
            "pgn": pgn,
        }
        games.append(rec)
        by_round.setdefault(rnd, []).append(game)

    games.sort(key=lambda g: (g["round"], g["board"]))

    # tournament-wise extracted PGNs, one file per round
    for rnd, round_games in by_round.items():
        text = "\n\n".join(_export(g, headers=True) for g in round_games)
        (out_dir / f"round-{rnd:02d}.pgn").write_text(text + "\n")

    rounds = max((g["round"] for g in games), default=0)
    index = {
        "slug": src["slug"], "tournament": src["tournament"], "year": src["year"],
        "section": src["section"], "format": src["format"], "label": label,
        "rounds": rounds, "count": len(games), "has_clock": "%clk" in (games[0]["pgn"] if games else ""),
    }
    tournament_doc = {"slug": src["slug"], "label": label, "section": src["section"], "games": games}
    print(f"  {src['slug']}: {len(games)} games, {rounds} rounds"
          + (f", {truncated} truncated" if truncated else ""))
    return {"index": index, "doc": tournament_doc}


def main() -> None:
    (WEB / "t").mkdir(parents=True, exist_ok=True)
    indexes = []
    for src in SOURCES:
        built = build_source(src)
        indexes.append(built["index"])
        (WEB / "t" / f"{src['slug']}.json").write_text(
            json.dumps(built["doc"], separators=(",", ":"))
        )
    (WEB / "library.json").write_text(json.dumps({"tournaments": indexes}, indent=2) + "\n")
    total = sum(i["count"] for i in indexes)
    print(f"wrote index ({len(indexes)} tournaments, {total} games) -> {WEB / 'library.json'}")


if __name__ == "__main__":
    main()
