"""Book-study extraction model + legality validator (book-trainer tier, Phase 0).

A "page extraction" is what the vision recognizer produces from a photographed book
page: a full FEN for the printed diagram plus the author's analysis as annotated PGN
movetext (variations in ``(...)``, comments in ``{...}``). Recognition output is never
trusted directly — :class:`StudyValidator` replays every variation from the FEN with
python-chess, so a single misread piece (which almost always makes some line illegal
within a few plies) surfaces as a validation issue instead of silently corrupting a
study. See ``docs/book-trainer.md``.

Like ``pipeline.py``, this module lives behind the ``pipeline`` optional dependency
(python-chess); the core feature engine stays zero-dependency.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

import chess
import chess.pgn


@dataclass(frozen=True)
class PageExtraction:
    """Immutable recognizer output for one diagrammed position on a book page.

    ``fen`` must be a full 6-field FEN (side to move matters for legality).
    ``movetext`` is standard annotated PGN movetext starting from that position.
    """

    fen: str
    movetext: str
    intro: str = ""
    source: str = ""


@dataclass(frozen=True)
class ValidationReport:
    """Outcome of replaying an extraction's movetext from its FEN.

    ``ok`` is True only when the FEN parses and every move in every variation is
    legal. ``issues`` holds human-readable problems; the counters describe the parsed
    tree (useful as a richness sanity check — 0 moves from a page of analysis is
    itself suspicious).
    """

    ok: bool
    issues: tuple[str, ...] = ()
    moves: int = 0
    branches: int = 0
    comments: int = 0

    @property
    def summary(self) -> str:
        """One-line report for logs and CLI output."""
        status = "OK" if self.ok else "NEEDS REVIEW"
        head = f"{status}: {self.moves} moves, {self.branches} sidelines, {self.comments} comments"
        if self.issues:
            head += " | " + "; ".join(self.issues)
        return head


class StudyValidator:
    """Replays an extraction's full variation tree to certify it is self-consistent."""

    def validate(self, extraction: PageExtraction) -> ValidationReport:
        """Validate FEN syntax, then replay every variation from that position."""
        issues: list[str] = []
        try:
            chess.Board(extraction.fen)
        except ValueError as exc:
            return ValidationReport(ok=False, issues=(f"invalid FEN: {exc}",))

        game = self._read_game(extraction)
        if game is None:
            return ValidationReport(ok=False, issues=("movetext could not be parsed at all",))

        issues.extend(f"illegal or unreadable move: {err}" for err in game.errors)
        moves, branches, comments = self._tree_stats(game)
        if moves == 0:
            issues.append("no moves extracted")
        return ValidationReport(
            ok=not issues, issues=tuple(issues), moves=moves, branches=branches, comments=comments
        )

    def _read_game(self, extraction: PageExtraction) -> chess.pgn.Game | None:
        """Parse the movetext as a PGN game seeded from the extraction's FEN.

        python-chess collects illegal/unreadable moves into ``game.errors`` rather
        than raising, which is exactly the report we want.
        """
        pgn = f'[SetUp "1"]\n[FEN "{extraction.fen}"]\n\n{extraction.movetext.strip()} *\n'
        return chess.pgn.read_game(io.StringIO(pgn))

    def _tree_stats(self, game: chess.pgn.Game) -> tuple[int, int, int]:
        """Count moves, sideline branches, and commented nodes across the whole tree."""
        moves = branches = comments = 0
        stack: list[chess.pgn.GameNode] = [game]
        while stack:
            node = stack.pop()
            if node.move is not None:
                moves += 1
            if node.comment.strip():
                comments += 1
            branches += max(0, len(node.variations) - 1)
            stack.extend(node.variations)
        return moves, branches, comments


# Thin functional wrapper, mirroring the features()/sideFeats() contract style (§13).
_VALIDATOR = StudyValidator()


def validate_extraction(fen: str, movetext: str) -> ValidationReport:
    """Validate (fen, movetext) with a shared :class:`StudyValidator`."""
    return _VALIDATOR.validate(PageExtraction(fen=fen, movetext=movetext))
