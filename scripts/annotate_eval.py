"""Annotate a tournament's games with engine evals (free, local Stockfish).

Walks each game in ``web/data/t/<slug>.json``, evaluates every position with Stockfish,
and writes ``[%eval ...]`` into the move comments (merging with the existing ``%clk``),
so the pipeline's EVAL.acpl / EVAL.consistency features compute. Re-run build_profiles.py
afterwards to refresh the profiles.

Usage:
    engine/.venv/bin/python scripts/annotate_eval.py <slug> [max_games] [depth]

Stockfish is GPL/free; this only costs local compute (~minutes per small event). Lichess
cloud-eval is free too but cache-only, so it misses most OTB middlegames — hence local SF.
"""

from __future__ import annotations

import io
import json
import sys
import time
from pathlib import Path

import chess
import chess.engine
import chess.pgn

STOCKFISH = "/opt/homebrew/bin/stockfish"
ROOT = Path(__file__).resolve().parents[1]


def annotate(slug: str, max_games: int | None = None, depth: int = 12) -> None:
    path = ROOT / "web" / "data" / "t" / f"{slug}.json"
    doc = json.loads(path.read_text())
    games = doc["games"][:max_games] if max_games else doc["games"]

    engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH)
    engine.configure({"Threads": 4, "Hash": 256})
    limit = chess.engine.Limit(depth=depth)
    started = time.time()
    try:
        for i, g in enumerate(games):
            game = chess.pgn.read_game(io.StringIO(g["pgn"]))
            if game is None:
                continue
            for node in game.mainline():
                board = node.board()
                if board.is_game_over():
                    continue  # no eval for a finished position (mate/stalemate)
                info = engine.analyse(board, limit)
                if "score" in info:
                    node.set_eval(info["score"])  # writes white-POV [%eval ...], keeps %clk
            exporter = chess.pgn.StringExporter(headers=True, variations=False, comments=True)
            g["pgn"] = game.accept(exporter)
            print(f"  {slug} {i + 1}/{len(games)} {g['id']}  ({time.time() - started:.0f}s)", flush=True)
    finally:
        engine.quit()

    path.write_text(json.dumps(doc, separators=(",", ":")))
    print(f"annotated {len(games)} games (depth {depth}) -> {path}")


if __name__ == "__main__":
    slug = sys.argv[1] if len(sys.argv) > 1 else "candidates-2026-open"
    mg = int(sys.argv[2]) if len(sys.argv) > 2 else None
    d = int(sys.argv[3]) if len(sys.argv) > 3 else 12
    annotate(slug, mg, d)
