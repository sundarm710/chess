"""Golden tests for chesslab.study — the book-trainer extraction validator.

The load-bearing property under test: a variation tree that is legal from the true
diagram FEN becomes ILLEGAL when a single piece is misread, so recognition errors
surface as validation issues instead of silently corrupting a study.
"""

from chesslab.study import PageExtraction, StudyValidator, validate_extraction

# Position after 1. e4 e5 2. Nf3 — Black to move (full 6-field FEN; side to move
# and castling rights are part of what recognition must get right).
FEN_AFTER_NF3 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2"
# Same position with Black's e5 pawn misread as absent — the kind of single-piece
# recognition error the validator exists to catch.
FEN_MISSING_E5 = "rnbqkbnr/pppp1ppp/8/8/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2"

# Author-style analysis: mainline + one commented sideline.
MOVETEXT = (
    "2... Nc6 { The natural developing move. } "
    "(2... d6 { The Philidor — passive but solid. } 3. d4 exd4) "
    "3. Bb5 a6"
)

VALIDATOR = StudyValidator()


def test_valid_tree_replays_from_fen():
    report = VALIDATOR.validate(PageExtraction(fen=FEN_AFTER_NF3, movetext=MOVETEXT))
    assert report.ok, report.summary
    assert report.moves == 6  # Nc6, Bb5, a6 + d6, d4, exd4
    assert report.branches == 1
    assert report.comments == 2


def test_single_misread_piece_breaks_a_line():
    # Without the e5 pawn, the sideline's 3... exd4 is illegal.
    report = VALIDATOR.validate(PageExtraction(fen=FEN_MISSING_E5, movetext=MOVETEXT))
    assert not report.ok
    assert any("illegal" in issue for issue in report.issues)


def test_garbage_san_is_flagged():
    report = validate_extraction(FEN_AFTER_NF3, "2... Zz9 3. Bb5")
    assert not report.ok


def test_malformed_fen_is_flagged():
    report = validate_extraction("this is not a fen", MOVETEXT)
    assert not report.ok
    assert any("invalid FEN" in issue for issue in report.issues)


def test_empty_movetext_is_flagged():
    report = validate_extraction(FEN_AFTER_NF3, "")
    assert not report.ok
    assert report.moves == 0
