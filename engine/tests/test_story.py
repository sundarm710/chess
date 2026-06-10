"""Story layer: WP-based eval features, state contrasts, chapters, moments, archetypes,
and their flow into game summaries and tournament profiles."""

from chesslab import build_default_registry
from chesslab.aggregate import summarize, tournament_profile
from chesslab.manifest import build_manifest
from chesslab.orchestrator import Orchestrator
from chesslab.pipeline import parse_pgn

# A knight-shuffle game: dead equal for 4 moves, then White's 5.Nf3?? is met by evals
# saying Black is completely winning (-8.0) for the rest. One white blunder, decisive.
SHUFFLE_BLUNDER = (
    '[Result "0-1"]\n\n'
    "1. Nf3 {[%eval 0.0]} Nf6 {[%eval 0.0]} 2. Ng1 {[%eval 0.0]} Ng8 {[%eval 0.0]} "
    "3. Nf3 {[%eval 0.0]} Nf6 {[%eval 0.0]} 4. Ng1 {[%eval 0.0]} Ng8 {[%eval 0.0]} "
    "5. Nf3 {[%eval -8.0]} Nf6 {[%eval -8.0]} 6. Ng1 {[%eval -8.0]} Ng8 {[%eval -8.0]} "
    "7. Nf3 {[%eval -8.0]} Nf6 {[%eval -8.0]} 8. Ng1 {[%eval -8.0]} Ng8 {[%eval -8.0]} 0-1"
)
QUIET_DRAW = (
    '[Result "1/2-1/2"]\n\n'
    "1. Nf3 {[%eval 0.1]} Nf6 {[%eval 0.0]} 2. Ng1 {[%eval 0.1]} Ng8 {[%eval 0.0]} "
    "3. Nf3 {[%eval 0.1]} Nf6 {[%eval 0.0]} 1/2-1/2"
)
NO_EVAL = "1. e4 e5 2. Nf3 Nc6 *"


def _run(pgn):
    return Orchestrator(build_default_registry()).run(parse_pgn(pgn))


def _feat(ply, fid, side):
    return next(f for f in ply["features"] if f["id"] == fid and f["side"] == side)


class TestWpFeatures:
    def test_blunder_and_worst_drop(self):
        last = _run(SHUFFLE_BLUNDER)["plies"][-1]
        assert _feat(last, "EVAL.blunders", "w")["value"] == 1
        assert _feat(last, "EVAL.blunders", "b")["value"] == 0
        assert _feat(last, "EVAL.mistakes", "w")["value"] == 0
        # 0.5 -> ~0.05 is a ~45-point drop.
        assert 40 < _feat(last, "EVAL.worst_drop", "w")["value"] < 50
        assert _feat(last, "EVAL.worst_drop", "b")["value"] == 0.0
        # Mean over 8 white moves: one ~45pp drop, rest 0 -> ~5.6pp.
        assert 4 < _feat(last, "EVAL.wp_loss", "w")["value"] < 7

    def test_unavailable_without_eval(self):
        last = _run(NO_EVAL)["plies"][-1]
        for fid in ("EVAL.wp_loss", "EVAL.blunders", "EVAL.worst_drop",
                    "DEC.complicate_worse", "DEC.simplify_better"):
            f = _feat(last, fid, "w")
            assert f["status"] == "unavailable" and f["value"] is None

    def test_state_contrast_needs_both_states(self):
        last = _run(SHUFFLE_BLUNDER)["plies"][-1]
        # White moved both while equal and while worse (all quiet) -> contrast 0.
        f = _feat(last, "DEC.complicate_worse", "w")
        assert f["status"] == "ok" and f["value"] == 0.0
        # Black was never worse -> no contrast to report.
        assert _feat(last, "DEC.complicate_worse", "b")["status"] == "unavailable"


class TestPlyAnnotations:
    def test_wp_and_state_on_plies(self):
        plies = _run(SHUFFLE_BLUNDER)["plies"]
        assert plies[1]["wp"] == 0.5 and plies[1]["state"] == "="
        assert plies[9]["wp"] < 0.1 and plies[9]["state"] == "b"

    def test_absent_without_eval(self):
        assert "wp" not in _run(NO_EVAL)["plies"][1]


class TestStory:
    def test_chapters_split_at_the_blunder(self):
        story = _run(SHUFFLE_BLUNDER)["story"]
        chapters = story["chapters"]
        assert len(chapters) == 2
        assert chapters[0]["state"] == "=" and chapters[1]["state"] == "b++"
        assert chapters[1]["start_ply"] == 9
        assert chapters[1]["label"] == "Black winning"
        # Side stats inside the chapter: White made 4 of the last 8 plies, all quiet.
        assert chapters[1]["sides"]["w"]["moves"] == 4
        assert chapters[1]["sides"]["w"]["forcing"] == 0

    def test_blunder_moment(self):
        moments = _run(SHUFFLE_BLUNDER)["story"]["moments"]
        blunders = [m for m in moments if m["kind"] == "blunder"]
        assert len(blunders) == 1
        m = blunders[0]
        assert m["ply"] == 9 and m["side"] == "w" and m["move"] == "5.Nf3"
        assert m["drop"] > 0.4

    def test_archetype_tags(self):
        tags = _run(SHUFFLE_BLUNDER)["story"]["tags"]
        assert "single_blunder:w" in tags
        assert "early_collapse:w" in tags
        assert "blunder_fest" not in tags

    def test_quiet_draw(self):
        assert _run(QUIET_DRAW)["story"]["tags"] == ["quiet_draw"]

    def test_no_eval_story_is_calm(self):
        story = _run(NO_EVAL)["story"]
        assert story["tags"] == []
        # Chapters fall back to phase segmentation.
        assert all(c["state"] in ("opening", "middlegame", "endgame") for c in story["chapters"])


class TestAggregation:
    def _profile(self):
        analysis = _run(SHUFFLE_BLUNDER)
        game = {"id": "t__r01b01", "round": 1, "white": "W Player", "black": "B Player",
                "welo": "2700", "belo": "2700", "result": "0-1", "eco": "A04"}
        s = summarize(analysis, slug="t", game=game)
        registry = build_default_registry()
        return s, tournament_profile(
            "t", "T", [s], build_manifest(registry),
            has_clock=False, has_eval=True,
            feature_set_version=registry.feature_set_version(), n_min=1,
        )

    def test_summary_carries_tags_and_states(self):
        s, _ = self._profile()
        assert "single_blunder:w" in s.tags
        cell = next(c for c in s.cells if c.feature_id == "DYN.initiative" and c.side == "w")
        assert "equal" in cell.state_values and "worse" in cell.state_values
        shared = next(c for c in s.cells if c.feature_id == "TAC.density")
        assert shared.state_values == {}  # shared cells have no side to band by

    def test_profile_archetypes_and_states(self):
        _, profile = self._profile()
        w = profile["players"]["W Player"]
        b = profile["players"]["B Player"]
        # Side-suffixed tags attribute to that player only.
        assert w["archetypes"].get("single_blunder") == 1
        assert "single_blunder" not in b["archetypes"]
        assert w["game_rows"][0]["tags"] == ["early_collapse:w", "single_blunder:w"] or \
            set(w["game_rows"][0]["tags"]) >= {"single_blunder:w"}
        # State slices surface in the rollups.
        assert "states" in w["rollups"]["DYN.initiative"]
