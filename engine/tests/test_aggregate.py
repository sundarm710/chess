"""Aggregation spine tests (Milestone 2, Phase 1)."""

import pytest

from chesslab import build_default_registry
from chesslab.aggregate import (
    FeatureCell,
    GameSummary,
    REDUCERS,
    resolve_reducer,
    summarize,
    tournament_profile,
)
from chesslab.manifest import build_manifest
from chesslab.orchestrator import Orchestrator
from chesslab.pipeline import parse_pgn

SCHOLAR = "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# *"
CLOCKED = ("1. e4 {[%emt 0:00:05]} {[%clk 0:09:55]} e5 {[%emt 0:00:09]} {[%clk 0:09:51]} "
           "2. Nf3 {[%emt 0:00:03]} {[%clk 0:09:58]} *")


@pytest.fixture(scope="module")
def manifest():
    return build_manifest(build_default_registry())


class TestReducerResolution:
    def test_every_feature_resolves_to_a_known_reducer(self, manifest):
        for fid, m in manifest.items():
            r = resolve_reducer(m)
            assert r in REDUCERS, f"{fid} -> unknown reducer {r}"

    def test_defaults(self):
        assert resolve_reducer({"scope": "game"}) == "end"
        assert resolve_reducer({"scope": "position"}) == "mean"

    def test_declared_overrides_default(self):
        assert resolve_reducer({"scope": "position", "aggregation": "max"}) == "max"

    def test_unknown_reducer_raises(self):
        with pytest.raises(ValueError):
            resolve_reducer({"aggregation": "bogus"})


class TestSummarize:
    def _summary(self, pgn):
        analysis = Orchestrator(build_default_registry()).run(parse_pgn(pgn))
        game = {"id": "test__r01b01", "round": 1, "white": "A", "black": "B",
                "welo": "2700", "belo": "2700", "result": "1-0", "eco": "C20"}
        return summarize(analysis, slug="test", game=game)

    def test_basic_shape(self):
        g = self._summary(SCHOLAR)
        assert g.white == "?" or isinstance(g.white, str)
        ids = {(c.feature_id, c.side) for c in g.cells}
        assert ("MAT.balance", "w") in ids
        assert ("STR.tension", "shared") in ids
        assert all(c.status in ("ok", "unavailable", "na") for c in g.cells)

    def test_clock_unavailable_without_clocks(self):
        g = self._summary(SCHOLAR)
        clk = next(c for c in g.cells if c.feature_id == "TIM.clock" and c.side == "w")
        assert clk.status == "unavailable" and clk.value is None

    def test_clock_min_reducer_with_clocks(self):
        g = self._summary(CLOCKED)
        clk = next(c for c in g.cells if c.feature_id == "TIM.clock" and c.side == "w")
        assert clk.reducer == "min" and clk.status == "ok"
        assert clk.value == 595.0  # low-water mark of White's clock (9:55)


def _cell(fid, side, value, status="ok"):
    return FeatureCell(fid, side, value, status, "mean")


def _summary(gid, white, black, result, cells, welo=2700, belo=2700):
    return GameSummary(gid, "t", 1, white, black, welo, belo, result, "C20", False, False, tuple(cells))


class TestTournamentProfile:
    MANIFEST = {
        "SPC.space": {"higher": "good"},
        "MAT.hanging": {"higher": "bad"},
    }

    def _profile(self, summaries, n_min=1):
        return tournament_profile(
            "t", "Test", summaries, self.MANIFEST,
            has_clock=False, has_eval=False, feature_set_version="v", n_min=n_min,
        )

    def test_leaderboard_orders_by_direction(self):
        # A averages 10 space, B averages 4 → higher=good ranks A first.
        sums = [
            _summary("g1", "A", "B", "1-0", [_cell("SPC.space", "w", 10), _cell("SPC.space", "b", 4)]),
            _summary("g2", "B", "A", "0-1", [_cell("SPC.space", "w", 4), _cell("SPC.space", "b", 10)]),
        ]
        prof = self._profile(sums)
        board = prof["leaderboards"]["SPC.space"]
        assert board["available"] is True
        assert [e[0] for e in board["entries"]] == ["A", "B"]
        # higher="bad" inverts the order.
        sums2 = [_summary("g1", "A", "B", "1-0",
                          [_cell("MAT.hanging", "w", 0), _cell("MAT.hanging", "b", 9)])]
        b2 = self._profile(sums2)["leaderboards"]["MAT.hanging"]
        assert b2["entries"][0][0] == "A"  # 0 hanging beats 9

    def test_min_n_gate_pushes_low_sample_down(self):
        # A: 3 games (mean 5); B: 1 game (mean 100). n_min=3 → A ranked above B despite lower value.
        sums = [_summary(f"g{i}", "A", "Z", "1-0", [_cell("SPC.space", "w", 5)]) for i in range(3)]
        sums.append(_summary("gb", "B", "Z", "1-0", [_cell("SPC.space", "w", 100)]))
        board = self._profile(sums, n_min=3)["leaderboards"]["SPC.space"]
        assert board["entries"][0][0] == "A"  # qualified beats sub-threshold

    def test_unavailable_excluded_and_counted(self):
        sums = [_summary("g1", "A", "B", "1-0",
                         [_cell("SPC.space", "w", None, "unavailable"), _cell("SPC.space", "b", 7)])]
        prof = self._profile(sums)
        a = prof["players"]["A"]["rollups"]["SPC.space"]
        assert a["n"] == 0 and a["mean"] is None and a["n_unavailable"] == 1

    def test_score_and_performance(self):
        sums = [_summary("g1", "A", "B", "1-0", [], welo=2700, belo=2800)]
        a = self._profile(sums)["players"]["A"]
        assert a["score"] == 1.0 and a["wins"] == 1
        assert a["avg_opp_elo"] == 2800.0
        assert a["performance_elo"] == 2800 + 400  # one win vs 2800
