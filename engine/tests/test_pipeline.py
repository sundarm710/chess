"""PGN pipeline tests — move application + %clk/%eval preservation."""

import chess

from chesslab.pipeline import game_id_for, parse_pgn

MORPHY = """[Event "Paris"]
1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7
8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8
13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0"""

# A short game with lichess-style clock + eval annotations on comments.
CLOCKED = """[Event "Rated Blitz"]
[Result "*"]
1. e4 { [%eval 0.2] [%clk 0:03:00] } e5 { [%eval 0.18] [%clk 0:02:58] } 2. Nf3 { [%eval 0.25] [%clk 0:02:55] } *"""


class TestParsePgn:
    def test_morphy_move_and_position_counts(self):
        game = parse_pgn(MORPHY)
        assert game.ply_count == 33
        assert len(game.positions) == 34  # start + one per ply
        assert game.positions[0].ply == 0
        assert game.result == "1-0"

    def test_last_move_is_mate(self):
        game = parse_pgn(MORPHY)
        last = game.moves[-1]
        assert last.san == "Rd8#"
        assert last.is_mate is True
        assert last.is_check is True
        assert last.mover == "w"

    def test_castling_flagged(self):
        game = parse_pgn(MORPHY)
        castle = next(m for m in game.moves if m.san.startswith("O-O"))
        assert castle.is_castle is True

    def test_capture_flagged(self):
        game = parse_pgn(MORPHY)
        cap = next(m for m in game.moves if "x" in m.san)
        assert cap.is_capture is True

    def test_fens_match_python_chess(self):
        game = parse_pgn(MORPHY)
        # Position FENs must equal what python-chess produces stepping the same moves.
        board = chess.Board()
        assert game.positions[0].fen == board.fen()
        for mv, pos in zip(game.moves, game.positions[1:]):
            board.push_uci(mv.uci)
            assert pos.fen == board.fen()

    def test_no_clock_or_eval_in_plain_pgn(self):
        game = parse_pgn(MORPHY)
        assert game.has_clock is False
        assert game.has_eval is False
        assert all(m.clk_seconds is None for m in game.moves)

    def test_clock_and_eval_preserved(self):
        game = parse_pgn(CLOCKED)
        assert game.has_clock is True
        assert game.has_eval is True
        assert game.moves[0].clk_seconds == 180.0  # 0:03:00
        assert game.moves[0].eval_cp == 20  # 0.2 pawns
        assert game.moves[1].clk_seconds == 178.0

    def test_game_id_is_idempotent(self):
        assert game_id_for(MORPHY) == game_id_for(MORPHY)
        assert game_id_for(MORPHY) != game_id_for(CLOCKED)
