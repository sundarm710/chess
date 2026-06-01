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


class TestPhaseReductions:
    META = {
        "F.mean": {"scope": "position"},                          # default mean
        "F.end": {"scope": "game"},                               # default end
        "F.max": {"scope": "position", "aggregation": "max"},     # declared max
    }

    def _summary(self):
        def feat(fid, val):
            return {"id": fid, "side": "w", "value": val, "status": "ok"}
        plies = [
            {"phase": "opening", "features": [feat("F.mean", 10), feat("F.end", 1), feat("F.max", 5)]},
            {"phase": "opening", "features": [feat("F.mean", 20), feat("F.end", 2), feat("F.max", 3)]},
            {"phase": "middlegame", "features": [feat("F.mean", 30), feat("F.end", 3), feat("F.max", 7)]},
        ]
        analysis = {"meta": self.META, "plies": plies, "has_clock": False, "has_eval": False}
        game = {"id": "g", "round": 1, "white": "A", "black": "B",
                "welo": "2700", "belo": "2700", "result": "1-0", "eco": "C20"}
        return summarize(analysis, slug="t", game=game)

    def test_mean_averages_only_the_phase(self):
        c = next(c for c in self._summary().cells if c.feature_id == "F.mean")
        assert c.phase_values["opening"] == pytest.approx(15.0)
        assert c.phase_values["middlegame"] == pytest.approx(30.0)
        assert c.phase_values["endgame"] is None       # no endgame plies
        assert c.value == pytest.approx(20.0)           # 10,20,30 over the whole game

    def test_end_takes_last_ply_within_phase(self):
        c = next(c for c in self._summary().cells if c.feature_id == "F.end")
        assert c.phase_values["opening"] == 2.0         # last opening ply, not the global last
        assert c.phase_values["middlegame"] == 3.0
        assert c.value == 3.0

    def test_max_per_phase(self):
        c = next(c for c in self._summary().cells if c.feature_id == "F.max")
        assert c.phase_values["opening"] == 5.0
        assert c.phase_values["middlegame"] == 7.0
        assert c.phase_values["endgame"] is None


def _cell(fid, side, value, status="ok", phase_values=None):
    return FeatureCell(fid, side, value, status, "mean", phase_values or {})


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


class TestPhaseAndColourRollups:
    MANIFEST = {"SPC.space": {"higher": "good"}}

    def _profile(self, sums):
        return tournament_profile("t", "T", sums, self.MANIFEST,
                                  has_clock=False, has_eval=False, feature_set_version="v", n_min=1)

    def test_phase_marginals_and_omitted_empty_phase(self):
        sums = [
            _summary("g1", "A", "B", "1-0", [_cell("SPC.space", "w", 10,
                     phase_values={"opening": 8, "middlegame": 12, "endgame": None})]),
            _summary("g2", "A", "B", "1-0", [_cell("SPC.space", "w", 20,
                     phase_values={"opening": 18, "middlegame": 22, "endgame": None})]),
        ]
        roll = self._profile(sums)["players"]["A"]["rollups"]["SPC.space"]
        assert roll["phases"]["opening"] == {"mean": 13.0, "n": 2}
        assert roll["phases"]["middlegame"] == {"mean": 17.0, "n": 2}
        assert "endgame" not in roll["phases"]            # no endgame plies → key absent
        assert all(roll["phases"][ph]["n"] <= roll["n"] for ph in roll["phases"])

    def test_colour_marginal_n_splits_total(self):
        # A plays white in g1, black in g2; a shared feature lands in both colour buckets.
        sums = [
            _summary("g1", "A", "B", "1-0", [_cell("STR.x", "shared", 10, phase_values={"opening": 10})]),
            _summary("g2", "B", "A", "1-0", [_cell("STR.x", "shared", 20, phase_values={"opening": 20})]),
        ]
        roll = self._profile(sums)["players"]["A"]["rollups"]["STR.x"]
        assert roll["n"] == 2
        assert roll["n_white"] + roll["n_black"] == roll["n"]
        assert roll["mean_white"] == 10.0 and roll["mean_black"] == 20.0

    def test_cross_emitted_for_dense_field(self):
        sums = [_summary(f"g{i}", "A", "B", "1-0",
                         [_cell("SPC.space", "w", 10, phase_values={"opening": 8, "middlegame": 12})])
                for i in range(8)]
        prof = self._profile(sums)
        assert prof["emit_cross"] is True
        roll = prof["players"]["A"]["rollups"]["SPC.space"]
        assert roll["cross"]["opening:w"] == {"mean": 8.0, "n": 8}

    def test_game_rows_carry_phase_vals_on_dense_fields(self):
        sums = [_summary(f"g{i}", "A", "B", "1-0",
                         [_cell("SPC.space", "w", 11, phase_values={"opening": 8, "middlegame": 12})])
                for i in range(8)]
        doc = self._profile(sums)["players"]["A"]
        row = doc["game_rows"][0]
        assert row["phase_vals"]["opening"]["SPC.space"] == 8
        # mean of per-game opening values reconciles with the phase rollup the matrix shows
        op = [r["phase_vals"]["opening"]["SPC.space"] for r in doc["game_rows"]]
        assert sum(op) / len(op) == doc["rollups"]["SPC.space"]["phases"]["opening"]["mean"]

    def test_phase_vals_dropped_on_sparse_field(self):
        sums = [_summary("g1", "A", "B", "1-0", [_cell("SPC.space", "w", 10, phase_values={"opening": 8})]),
                _summary("g2", "A", "B", "1-0", [_cell("SPC.space", "w", 10, phase_values={"opening": 8})])]
        doc = self._profile(sums)["players"]["A"]
        assert "phase_vals" not in doc["game_rows"][0]

    def test_cross_omitted_for_sparse_field(self):
        sums = [_summary("g1", "A", "B", "1-0", [_cell("SPC.space", "w", 10, phase_values={"opening": 8})]),
                _summary("g2", "A", "B", "1-0", [_cell("SPC.space", "w", 10, phase_values={"opening": 8})])]
        prof = self._profile(sums)
        assert prof["emit_cross"] is False
        assert "cross" not in prof["players"]["A"]["rollups"]["SPC.space"]

    def test_game_rows_reconcile_with_mean(self):
        sums = [
            _summary("g1", "A", "B", "1-0", [_cell("SPC.space", "w", 10)]),
            _summary("g2", "A", "B", "1-0", [_cell("SPC.space", "w", 6)]),
        ]
        doc = self._profile(sums)["players"]["A"]
        rows = doc["game_rows"]
        assert len(rows) == 2
        assert [r["vals"]["SPC.space"] for r in rows] == [10, 6]
        # mean of the per-game values equals the rollup mean shown in the matrix
        assert doc["rollups"]["SPC.space"]["mean"] == pytest.approx(8.0)
        assert rows[0]["opp"] == "B" and rows[0]["color"] == "w"

    def test_result_correlation_positive_when_feature_tracks_wins(self):
        # White (more space) always wins; black (less space) always loses → strong +r.
        sums = [_summary(f"g{i}", "A", "B", "1-0",
                         [_cell("SPC.space", "w", 10), _cell("SPC.space", "b", 2)])
                for i in range(8)]
        rc = self._profile(sums)["result_correlation"]["SPC.space"]
        assert rc["n"] == 16 and rc["r"] > 0.9
