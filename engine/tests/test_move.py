"""MOVE/GAME-tier assembly features (backend-only): initiative, density, prophylaxis."""

from chesslab import build_default_registry
from chesslab.orchestrator import Orchestrator
from chesslab.pipeline import parse_pgn

# Scholar's mate: White's only forcing move is the final Qxf7# (capture + check).
SCHOLAR = "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# *"


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


def test_move_features_in_manifest():
    analysis = _run(SCHOLAR)
    for fid in ("DYN.initiative", "TAC.density", "DEC.prophylaxis"):
        assert fid in analysis["meta"], f"{fid} missing from manifest"
        assert analysis["meta"][fid]["higher"] in ("good", "bad", "neutral")
