"""Win-probability layer: the cp→WP mapping, bands, drops and the per-game series."""

import pytest

from chesslab.pipeline import parse_pgn
from chesslab.winprob import (
    move_drop,
    perspective,
    state_of,
    win_prob,
    wp_series,
)


class TestWinProb:
    def test_equal_is_half(self):
        assert win_prob(0, None) == 0.5

    def test_monotonic_in_cp(self):
        assert win_prob(300, None) > win_prob(100, None) > win_prob(0, None) > win_prob(-100, None)

    def test_symmetric(self):
        assert win_prob(250, None) + win_prob(-250, None) == pytest.approx(1.0)

    def test_mate_is_certain(self):
        assert win_prob(None, 3) == 1.0
        assert win_prob(None, -1) == 0.0

    def test_unknown(self):
        assert win_prob(None, None) is None

    def test_known_anchor(self):
        # +1 pawn ≈ 59% for White under the Lichess logistic.
        assert win_prob(100, None) == pytest.approx(0.591, abs=0.002)


class TestBandsAndDrops:
    def test_perspective_flips(self):
        assert perspective("w", 0.7) == 0.7
        assert perspective("b", 0.7) == pytest.approx(0.3)

    def test_state_bands(self):
        assert state_of(0.60) == "better"
        assert state_of(0.59) == "equal"
        assert state_of(0.41) == "equal"
        assert state_of(0.40) == "worse"

    def test_move_drop_floored_and_sided(self):
        # White goes 0.5 -> 0.3: a 0.2 loss for White, a *gain* (0 loss) for Black.
        assert move_drop("w", 0.5, 0.3) == pytest.approx(0.2)
        assert move_drop("b", 0.5, 0.3) == 0.0
        assert move_drop("w", None, 0.3) is None


class TestSeries:
    def test_carry_forward_over_missing_evals(self):
        pgn = "1. e4 {[%eval 0.5]} e5 2. Nf3 {[%eval 0.3]} *"
        wps = wp_series(parse_pgn(pgn))
        assert wps[0] == 0.5
        assert wps[2] == wps[1]  # e5 has no eval — carries 1.e4's WP forward

    def test_evalless_game_is_unknown(self):
        wps = wp_series(parse_pgn("1. e4 e5 2. Nf3 *"))
        assert wps[0] == 0.5 and wps[1] is None and wps[2] is None
