"""Tests for the T1–T3 board features: pawn structure, rook files, mobility.

Mobility is cross-checked against a python-chess oracle (board.attacks) across a
range of positions, so the implementation is validated independently of the golden
numbers it produces.
"""

import chess
import pytest

from chesslab import Board, FeatureEngine

ENGINE = FeatureEngine()

FENS = [
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "r2qk2r/ppp2pp1/2np3p/2b1p2n/2B1P1bB/3P1N2/PPPN1PPP/R2Q1RK1 w kq - 4 9",
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",  # rook endgame, passed/doubled-ish
    "r1bqkbnr/pp1ppppp/2n5/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
]


def _oracle_mobility(fen: str, white: bool) -> int:
    board = chess.Board(fen)
    color = chess.WHITE if white else chess.BLACK
    own = board.occupied_co[color]
    total = 0
    for sq in chess.scan_forward(own):
        total += chess.popcount(int(board.attacks(sq)) & ~own)
    return total


@pytest.mark.parametrize("fen", FENS)
def test_mobility_matches_python_chess(fen):
    feats = ENGINE.features(Board.from_fen(fen))
    assert feats.w.mobility == _oracle_mobility(fen, True), f"{fen} white mobility"
    assert feats.b.mobility == _oracle_mobility(fen, False), f"{fen} black mobility"


class TestPawnStructure:
    def test_doubled_and_isolated(self):
        # White: doubled c-pawns (c2,c3), isolated a-pawn (no b-pawn).
        feats = ENGINE.features(Board.from_fen("4k3/8/8/8/8/2P5/P1P5/4K3 w - - 0 1"))
        assert feats.w.doubled == 1  # two pawns on the c-file -> 1 extra
        assert feats.w.isolated == 3  # a-pawn (no b) and both c-pawns (no b/d)

    def test_islands(self):
        # White pawns on a,b and e,h files -> 3 islands (a-b | e | h).
        feats = ENGINE.features(Board.from_fen("4k3/8/8/8/8/8/PP2P2P/4K3 w - - 0 1"))
        assert feats.w.islands == 3

    def test_passed_pawn(self):
        # White e5 pawn, no black pawns ahead on d/e/f -> passed.
        feats = ENGINE.features(Board.from_fen("4k3/8/8/4P3/8/8/8/4K3 w - - 0 1"))
        assert feats.w.passed == 1

    def test_rook_open_file(self):
        # White rook on d1; pawns on a2,b2,c2,f2,g2,h2 (none on d) -> d-file open for the rook.
        feats = ENGINE.features(Board.from_fen("4k3/8/8/8/8/8/PPP2PPP/3RK3 w - - 0 1"))
        assert feats.w.rook_open == 1


class TestBatch2:
    def test_bishop_quality_lone_bishop(self):
        # Lone white bishop on d4, no pawns -> quality = mobility / (1+0) = 13.
        feats = ENGINE.features(Board.from_fen("4k3/8/8/8/3B4/8/8/4K3 w - - 0 1"))
        assert feats.w.bishop_quality == 13.0

    def test_bishop_quality_penalised_by_same_colour_pawns(self):
        # Bishop on c1 (dark) boxed in, with dark-square pawns -> low quality (< lone value).
        feats = ENGINE.features(Board.from_fen("4k3/8/8/8/8/8/PPPPPPPP/2B1K3 w - - 0 1"))
        assert feats.w.bishop_quality < 1.0

    def test_knight_outpost(self):
        # White knight on e5 (enemy half), defended by a d4 pawn, no black b/d/f pawns to
        # challenge it -> one outpost.
        feats = ENGINE.features(Board.from_fen("4k3/8/8/4N3/3P4/8/8/4K3 w - - 0 1"))
        assert feats.w.outpost == 1

    def test_knight_not_outpost_if_challengeable(self):
        # Same knight, but a black f7 pawn can advance (f6/f5) to challenge e5 -> not an outpost.
        feats = ENGINE.features(Board.from_fen("4k3/5p2/8/4N3/3P4/8/8/4K3 w - - 0 1"))
        assert feats.w.outpost == 0

    def test_colour_complex_sign(self):
        # d4 is a dark square, so a dark-squared bishop tilts control toward dark (< 0).
        feats = ENGINE.features(Board.from_fen("4k3/8/8/8/3B4/8/8/4K3 w - - 0 1"))
        assert feats.w.colour_complex < 0

    def test_in_check(self):
        # Black queen on h4 rakes the a-diagonal onto the white king at e1.
        feats = ENGINE.features(Board.from_fen("4k3/8/8/8/7q/8/8/4K3 w - - 0 1"))
        assert feats.w.in_check == 1
        assert feats.b.in_check == 0
