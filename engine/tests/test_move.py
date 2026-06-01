"""MOVE/GAME-tier assembly features (backend-only): initiative, density, prophylaxis."""

from chesslab import build_default_registry
from chesslab.orchestrator import Orchestrator
from chesslab.pipeline import parse_pgn

# Scholar's mate: White's only forcing move is the final Qxf7# (capture + check).
SCHOLAR = "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# *"
MORPHY = (
    "1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 "
    "8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 "
    "14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0"
)
# A clocked mini-game (%emt time-spent + %clk remaining).
CLOCKED = ("1. e4 {[%emt 0:00:05]} {[%clk 0:09:55]} e5 {[%emt 0:00:03]} {[%clk 0:09:57]} "
           "2. Nf3 {[%emt 0:00:07]} {[%clk 0:09:48]} *")
# An eval-annotated game where White blunders the queen's worth on move 4.
EVALED = ("1. e4 {[%eval 0.2]} e5 {[%eval 0.1]} 2. Qh5 {[%eval 0.0]} Nc6 {[%eval 0.1]} "
          "3. Bc4 {[%eval 0.0]} Nf6 {[%eval 0.1]} 4. Qxf7 {[%eval -8.0]} *")


def _feat(ply, fid, side):
    return next(f for f in ply["features"] if f["id"] == fid and f["side"] == side)


def _run(pgn):
    return Orchestrator(build_default_registry()).run(parse_pgn(pgn))


class TestInitiative:
    def test_running_forcing_fraction(self):
        last = _run(SCHOLAR)["plies"][-1]
        # White: 4 moves, 1 forcing (Qxf7#) -> 0.25; Black: 3 quiet moves -> 0.
        assert _feat(last, "DYN.initiative", "w")["value"] == 0.25
        assert _feat(last, "DYN.initiative", "b")["value"] == 0.0

    def test_zero_at_start(self):
        p0 = _run(SCHOLAR)["plies"][0]
        assert _feat(p0, "DYN.initiative", "w")["value"] == 0.0
        assert _feat(p0, "DYN.initiative", "w")["delta"] is None


class TestDensity:
    def test_start_is_zero(self):
        p0 = _run(SCHOLAR)["plies"][0]
        # No captures/checks available and no tension in the start position.
        assert _feat(p0, "TAC.density", "shared")["value"] == 0

    def test_present_every_ply(self):
        for ply in _run(SCHOLAR)["plies"]:
            assert _feat(ply, "TAC.density", "shared")["value"] >= 0


class TestProphylaxis:
    def test_nonnegative_and_present(self):
        last = _run(SCHOLAR)["plies"][-1]
        for side in ("w", "b"):
            assert _feat(last, "DEC.prophylaxis", side)["value"] >= 0


class TestHeavyMoveFeatures:
    def test_swing_on_capture(self):
        # Qxf7# captures a pawn -> material balance swings by 1 on that ply.
        last = _run(SCHOLAR)["plies"][-1]
        assert _feat(last, "MAT.swing", "shared")["value"] == 1

    def test_tempo_waste_early_queen(self):
        # 2.Qh5 brings the queen out before three minors are developed.
        last = _run(SCHOLAR)["plies"][-1]
        assert _feat(last, "DEV.tempo_waste", "w")["value"] >= 1

    def test_tempo_waste_only_counts_in_the_opening(self):
        # A knight shuffle: each Ng1 re-moves a developed minor. The gate must stop
        # counting once we're past the opening, so extending the shuffle adds nothing.
        base = (" ".join(f"{m}. Nf3 Nf6 {m + 1}. Ng1 Ng8" for m in range(1, 13, 2)))
        short = _feat(_run(base + " *")["plies"][-1], "DEV.tempo_waste", "w")["value"]
        extra = " ".join(f"{m}. Nf3 Nf6 {m + 1}. Ng1 Ng8" for m in range(13, 19, 2))
        long = _feat(_run(base + " " + extra + " *")["plies"][-1], "DEV.tempo_waste", "w")["value"]
        assert short > 0
        assert long == short  # middlegame minor shuffles no longer inflate the count

    def test_exposure_in_a_sacrificial_game(self):
        # Morphy sacrifices material repeatedly -> White records exposure events.
        last = _run(MORPHY)["plies"][-1]
        assert _feat(last, "TAC.exposure", "w")["value"] >= 1

    def test_tension_holding(self):
        # Both sides decline an available pawn capture (c4xd5 / d5xc4).
        last = _run("1. d4 d5 2. c4 e6 3. Nc3 Nf6 *")["plies"][-1]
        assert _feat(last, "STR.tension_hold", "w")["value"] >= 1
        assert _feat(last, "STR.tension_hold", "b")["value"] >= 1

    def test_trade_discipline_present(self):
        last = _run(MORPHY)["plies"][-1]
        assert isinstance(_feat(last, "DEC.trade_discipline", "w")["value"], (int, float))


class TestClockFeatures:
    def test_move_time_and_remaining(self):
        plies = _run(CLOCKED)["plies"]
        assert _feat(plies[1], "TIM.move_time", "w")["value"] == 5      # %emt 0:00:05
        assert _feat(plies[1], "TIM.clock", "w")["value"] == 595         # %clk 0:09:55
        assert _feat(plies[2], "TIM.move_time", "b")["value"] == 3

    def test_unavailable_without_clock(self):
        f = _feat(_run(SCHOLAR)["plies"][-1], "TIM.move_time", "w")
        assert f["status"] == "unavailable" and f["value"] is None


class TestEvalFeatures:
    def test_acpl_picks_up_a_blunder(self):
        last = _run(EVALED)["plies"][-1]
        f = _feat(last, "EVAL.acpl", "w")
        assert f["status"] == "ok" and f["value"] > 0  # Qxf7?? cost ~810cp

    def test_unavailable_without_eval(self):
        f = _feat(_run(SCHOLAR)["plies"][-1], "EVAL.acpl", "w")
        assert f["status"] == "unavailable" and f["value"] is None

    def test_eval_engine_tag(self):
        meta = _run(SCHOLAR)["meta"]
        assert meta["EVAL.acpl"]["engine"] == "cached-eval-optional"


def test_move_features_in_manifest():
    analysis = _run(SCHOLAR)
    for fid in ("DYN.initiative", "TAC.density", "DEC.prophylaxis", "DEC.trade_discipline",
                "DEV.tempo_waste", "STR.tension_hold", "TAC.exposure", "MAT.swing",
                "TIM.move_time", "TIM.clock", "EVAL.acpl", "EVAL.consistency"):
        assert fid in analysis["meta"], f"{fid} missing from manifest"
        assert analysis["meta"][fid]["higher"] in ("good", "bad", "neutral")
