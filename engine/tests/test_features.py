"""Golden-value tests for the reference feature engine (CLAUDE.md §6).

These assertions are the contract the JS port must also satisfy. They run
automatically (CLAUDE.md §13) via the project test runner / PostToolUse hook.
"""

import dataclasses

import pytest

from chesslab import Board, FeatureEngine, Piece, PositionFeatures, features, features_from_fen
from chesslab.features import opposite

from .golden_fens import GOLDEN

ENGINE = FeatureEngine()


def _flatten(expected_side):
    return expected_side.items()


@pytest.mark.parametrize("fen,expected", GOLDEN.items())
def test_golden_position_features(fen, expected):
    """Every named field in the golden corpus matches the engine output exactly."""
    pos = features_from_fen(fen)
    for color in ("w", "b"):
        side = getattr(pos, color)
        for field, want in expected[color].items():
            got = getattr(side, field)
            assert got == want, f"{fen} [{color}].{field}: got {got}, want {want}"
    assert pos.tension == expected["tension"], f"{fen} tension"


class TestPiece:
    def test_value_lookup(self):
        assert Piece("q", "w").value == 9
        assert Piece("k", "b").value == 0
        assert Piece("p", "w").value == 1

    def test_frozen(self):
        with pytest.raises(dataclasses.FrozenInstanceError):
            Piece("q", "w").type = "r"  # type: ignore[misc]


class TestBoardFromFen:
    def test_start_position_corners_and_center(self):
        board = Board.from_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
        # a1 = (file 0, rank 0) is a white rook.
        assert board.piece_at(0, 0) == Piece("r", "w")
        # e8 = (file 4, rank 7) is a black king.
        assert board.piece_at(4, 7) == Piece("k", "b")
        # d4 = (file 3, rank 3) is empty.
        assert board.piece_at(3, 3) is None

    def test_rejects_short_fen(self):
        with pytest.raises(ValueError):
            Board.from_fen("8/8/8/8/8/8/8 w - - 0 1")  # only 7 ranks

    def test_rejects_overfull_rank(self):
        with pytest.raises(ValueError):
            Board.from_fen("rnbqkbnrr/8/8/8/8/8/8/8 w - - 0 1")


class TestAttackers:
    def test_start_knight_attacks_c3(self):
        board = Board.from_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
        # c3 = (file 2, rank 2) is attacked by the b1 knight and the b2/d2 pawns.
        attackers = board.attackers(2, 2, "w")
        assert "n" in attackers
        assert sorted(attackers) == ["n", "p", "p"]

    def test_sliding_stops_at_first_blocker(self):
        # White rook on a1, black rook on a4, nothing between.
        board = Board.from_fen("8/8/8/8/r7/8/8/R3K2k w - - 0 1")
        # a4 (file 0, rank 3) is attacked by the a1 rook (sliding up the open file).
        assert "r" in board.attackers(0, 3, "w")
        # a5 (file 0, rank 4) is shielded by the black rook on a4 — not reachable.
        assert "r" not in board.attackers(0, 4, "w")


class TestFeatureEngineStructure:
    def test_features_returns_immutable_bundle(self):
        pos = features_from_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
        assert isinstance(pos, PositionFeatures)
        with pytest.raises(dataclasses.FrozenInstanceError):
            pos.tension = 99  # type: ignore[misc]

    def test_functional_and_oo_apis_agree(self):
        fen = "r2qk2r/ppp2pp1/2np3p/2b1p2n/2B1P1bB/3P1N2/PPPN1PPP/R2Q1RK1 w kq - 4 9"
        board = Board.from_fen(fen)
        assert features(board) == ENGINE.features(board)

    def test_opposite(self):
        assert opposite("w") == "b"
        assert opposite("b") == "w"

    def test_symmetry_of_mirrored_position(self):
        # The start position is color-symmetric: both sides' vectors are identical.
        pos = features_from_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
        assert pos.w == pos.b
