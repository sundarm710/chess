"""Orchestrator tests — per-ply matrix, server-side deltas, golden agreement."""

import pytest

from chesslab import build_default_registry
from chesslab.orchestrator import Orchestrator
from chesslab.pipeline import parse_pgn

from .golden_fens import GOLDEN

MORPHY = """[Event "Paris"]
1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7
8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8
13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0"""


@pytest.fixture(scope="module")
def orchestrator():
    return Orchestrator(build_default_registry())


def _feature(ply_entry, fid, side):
    return next(f for f in ply_entry["features"] if f["id"] == fid and f["side"] == side)


class TestOrchestratorShape:
    def test_payload_structure(self, orchestrator):
        analysis = orchestrator.run(parse_pgn(MORPHY))
        assert set(analysis) >= {
            "game_id", "feature_set_version", "meta", "plies", "game_features",
            "headers", "result", "has_clock", "has_eval",
        }
        assert len(analysis["plies"]) == 34
        assert analysis["meta"]["MAT.balance"]["name"] == "Material"

    def test_each_ply_has_all_features(self, orchestrator):
        analysis = orchestrator.run(parse_pgn(MORPHY))
        # 21 per-side (×2) + 1 shared + 5 MOVE-tier (density + initiative w/b + prophylaxis w/b) = 48.
        for ply in analysis["plies"]:
            assert len(ply["features"]) == 48

    def test_first_ply_has_null_deltas(self, orchestrator):
        analysis = orchestrator.run(parse_pgn(MORPHY))
        assert all(f["delta"] is None for f in analysis["plies"][0]["features"])

    def test_delta_is_value_difference(self, orchestrator):
        analysis = orchestrator.run(parse_pgn(MORPHY))
        plies = analysis["plies"]
        for i in range(1, len(plies)):
            cur = _feature(plies[i], "ACT.control", "w")
            prev = _feature(plies[i - 1], "ACT.control", "w")
            assert cur["delta"] == pytest.approx(cur["value"] - prev["value"])

    def test_san_and_mover_attached(self, orchestrator):
        analysis = orchestrator.run(parse_pgn(MORPHY))
        assert analysis["plies"][0]["san"] is None
        assert analysis["plies"][1]["san"] == "e4"
        assert analysis["plies"][1]["mover"] == "w"


class TestStickyCastled:
    # White castles (4.O-O) then walks the king to h1 (off the g-file).
    PGN = "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O d6 5. Kh1 a6 *"

    def test_castled_stays_yes_after_king_moves(self, orchestrator):
        analysis = orchestrator.run(parse_pgn(self.PGN))
        last = analysis["plies"][-1]  # white king now on h1
        castled_w = _feature(last, "KSF.castle", "w")
        assert castled_w["value"] == 1  # sticky: once castled, stays castled


class TestOrchestratorGoldenAgreement:
    """Orchestrated values must equal the canonical golden numbers (CLAUDE.md §6)."""

    def test_start_position_board_features(self, orchestrator):
        # The Morphy start position (ply 0) must match the start-position golden.
        start_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        expected = GOLDEN[start_fen]
        analysis = orchestrator.run(parse_pgn(MORPHY))
        p0 = analysis["plies"][0]
        assert _feature(p0, "MAT.balance", "w")["value"] == float(expected["w"]["mat"])
        assert _feature(p0, "ACT.control", "w")["value"] == float(expected["w"]["control"])
        assert _feature(p0, "STR.tension", "shared")["value"] == float(expected["tension"])
