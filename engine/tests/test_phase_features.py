"""END-tier features: endgame share / onset (assembly) + phase drift.

The phase mix used to silently dilute the all-game means; these features turn it into
explicit, queryable signals (CLAUDE.md §17 / the endgame-dilution note).
"""

import pytest

from chesslab import build_default_registry
from chesslab.aggregate import summarize
from chesslab.orchestrator import Orchestrator
from chesslab.pipeline import parse_pgn

# A sacrificial mating attack — never simplifies, so it never reaches an endgame.
MORPHY = """[Event "Paris"]
1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7
8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8
13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0"""

# Queens and minors come off into a drawn rook endgame.
ENDGAME = """[Event "?"]
1. d4 d5 2. c4 e6 3. Nf3 Nd7 4. g3 dxc4 5. Bg2 Rb8 6. a4 b6 7. Nfd2 a5
8. Nxc4 Ba6 9. Nba3 Bb4+ 10. Bd2 Bxa3 11. Nxa3 Ne7 12. O-O O-O 13. b4 axb4
14. Bxb4 c5 15. Bc3 Nf5 16. Nb5 Bxb5 17. axb5 cxd4 18. Bxd4 Nxd4 19. Qxd4 Nc5
20. Rad1 Qxd4 21. Rxd4 Rfd8 22. Rfd1 Rxd4 23. Rxd4 Kf8 24. Rd6 Ke7 25. Rc6 Rd8
26. f4 Rd6 27. Rc7+ Rd7 28. Rc6 Rd6 29. Rc7+ Rd7 30. Rc6 Rd6 1/2-1/2"""


@pytest.fixture(scope="module")
def orch():
    return Orchestrator(build_default_registry())


def _last(analysis, fid, side="shared"):
    feats = analysis["plies"][-1]["features"]
    return next(f for f in feats if f["id"] == fid and f["side"] == side)


class TestNeverReachesEndgame:
    def test_share_zero_and_onset_unavailable(self, orch):
        a = orch.run(parse_pgn(MORPHY))
        assert _last(a, "END.endgame_share")["value"] == 0.0
        onset = _last(a, "END.endgame_onset")
        assert onset["value"] is None and onset["status"] == "unavailable"

    def test_drift_unavailable_without_an_endgame(self, orch):
        a = orch.run(parse_pgn(MORPHY))
        assert _last(a, "END.control_drift", "w")["status"] == "unavailable"


class TestEndgameGame:
    def test_endgame_share_is_a_fraction(self, orch):
        a = orch.run(parse_pgn(ENDGAME))
        share = _last(a, "END.endgame_share")["value"]
        assert 0.0 < share < 1.0

    def test_onset_is_a_move_number(self, orch):
        a = orch.run(parse_pgn(ENDGAME))
        onset = _last(a, "END.endgame_onset")
        assert onset["status"] == "ok" and onset["value"] >= 1

    def test_drift_present_once_both_phases_seen(self, orch):
        a = orch.run(parse_pgn(ENDGAME))
        for side in ("w", "b"):
            cell = _last(a, "END.control_drift", side)
            assert cell["status"] == "ok" and cell["value"] is not None

    def test_summarize_uses_end_reducer_for_share(self, orch):
        a = orch.run(parse_pgn(ENDGAME))
        summary = summarize(a, slug="t", game={"id": "g", "round": 1, "result": "1/2-1/2"})
        share_cell = next(c for c in summary.cells if c.feature_id == "END.endgame_share")
        # 'end' reducer → the final running share equals the per-ply last value.
        assert share_cell.reducer == "end"
        assert share_cell.value == pytest.approx(_last(a, "END.endgame_share")["value"])
