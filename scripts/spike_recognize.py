"""Phase-0 spike: recognize photographed chess-book pages (docs/book-trainer.md).

For each page photo, ask Claude vision to read the printed diagram into a full FEN
and the author's analysis into annotated PGN movetext, then replay every extracted
line from that FEN (chesslab.study.StudyValidator) so misreads surface immediately.

Recognition path (locked decision): the Claude Code subscription first — headless
``claude -p`` with the photo path (Claude reads it with its Read tool) — falling back
to the Anthropic API (claude-opus-4-8) when the CLI is unavailable.

Usage:
    engine/.venv/bin/python scripts/spike_recognize.py [photo ...]

With no args, processes every image in ``data/studies-raw/inbox/``. Results are
written as JSON next to a validation report to ``data/studies-raw/out/`` (both
directories are gitignored — book photos never enter git).
"""

from __future__ import annotations

import base64
import json
import mimetypes
import shutil
import subprocess
import sys
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))

from chesslab.study import PageExtraction, StudyValidator, ValidationReport  # noqa: E402

INBOX = ROOT / "data" / "studies-raw" / "inbox"
OUTBOX = ROOT / "data" / "studies-raw" / "out"
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".heic"}
API_MODEL = "claude-opus-4-8"
CLI_TIMEOUT_S = 1800  # the headless agent self-verifies against every printed line; dense pages run long

PROMPT = """\
You are reading one photographed page of a chess book. It contains a printed board
diagram and the author's analysis of that position (moves, variations, prose).

Extract it and respond with ONLY a JSON object (no markdown fences, no prose) with
exactly these fields:

{
  "diagram_found": true/false,
  "fen": "full 6-field FEN of the printed diagram (placement, side to move, castling, en passant, halfmove, fullmove)",
  "side_to_move_evidence": "how you determined whose move it is (caption text, first printed move number, etc.)",
  "intro": "the author's prose that frames the position, before the moves begin",
  "movetext": "the author's analysis as standard PGN movetext STARTING FROM the diagram position",
  "page_number": page number if visible, else null,
  "uncertainties": ["anything you could not read confidently, e.g. 'unsure if h2 is pawn or bishop'"]
}

Rules for movetext:
- Convert figurine notation to English letters (♘f3 -> Nf3).
- Variations go in parentheses, nested as printed; the author's main line stays at the top level.
- The author's prose annotations go in { } comments attached directly after the move
  they discuss, transcribed VERBATIM — never paraphrase, condense, or reword. The
  author's exact voice is the product; a shorter comment is a wrong comment.
- Preserve the book's variation labels (a), b), c), lines, arrows between diagrams)
  by starting the corresponding variation's first comment with that label.
- Keep move-quality suffixes on the move itself (Nf3!, h4!?, Qb3?). Put evaluation
  symbols (+-, =, unclear, with-compensation, etc.) inside the { } comment as plain text.
- Use "..." continuation for Black moves after a comment or variation (e.g. 12... Nf6).
- If the page's printed moves LEAD UP TO the diagram, do not include them — only the
  analysis that begins from the diagrammed position.
- If castling rights or en passant are not determinable from the page, use your best
  legal inference and note it in uncertainties.
"""


class RecognizerUnavailable(RuntimeError):
    """Raised when a recognizer cannot run in this environment (missing CLI/SDK/creds)."""


class Recognizer(ABC):
    """One way of turning a page photo into the recognition JSON dict."""

    name: str

    @abstractmethod
    def available(self) -> bool:
        """Cheap environment check — can this recognizer plausibly run?"""

    @abstractmethod
    def recognize(self, photo: Path) -> dict:
        """Return the parsed recognition JSON for one photo. May raise RecognizerUnavailable."""


class ClaudeCliRecognizer(Recognizer):
    """Primary path: headless ``claude -p`` on the Claude Code subscription.

    The prompt references the photo's absolute path; the headless agent reads it with
    its Read tool (the only tool we allow), so no bytes are shipped by this script.
    """

    name = "claude-cli (subscription)"

    def available(self) -> bool:
        return shutil.which("claude") is not None

    def recognize(self, photo: Path) -> dict:
        prompt = f"Read the image at {photo.resolve()} and follow these instructions.\n\n{PROMPT}"
        try:
            proc = subprocess.run(
                ["claude", "-p", prompt, "--output-format", "json", "--allowedTools", "Read"],
                capture_output=True,
                text=True,
                timeout=CLI_TIMEOUT_S,
            )
        except FileNotFoundError as exc:
            raise RecognizerUnavailable("claude CLI not found") from exc
        except subprocess.TimeoutExpired as exc:
            raise RecognizerUnavailable(f"claude CLI timed out after {CLI_TIMEOUT_S}s") from exc
        if proc.returncode != 0:
            raise RecognizerUnavailable(f"claude CLI failed: {proc.stderr.strip()[:300]}")
        envelope = json.loads(proc.stdout)
        if envelope.get("is_error"):
            raise RecognizerUnavailable(f"claude CLI error result: {str(envelope.get('result'))[:300]}")
        return extract_json(str(envelope.get("result", "")))


class AnthropicApiRecognizer(Recognizer):
    """Fallback path: the Anthropic API with the image sent base64 in a vision block."""

    name = f"anthropic-api ({API_MODEL})"

    def available(self) -> bool:
        try:
            import anthropic  # noqa: F401
        except ImportError:
            return False
        return True

    def recognize(self, photo: Path) -> dict:
        try:
            import anthropic
        except ImportError as exc:
            raise RecognizerUnavailable("anthropic SDK not installed (pip install anthropic)") from exc

        media_type = mimetypes.guess_type(photo.name)[0] or "image/jpeg"
        image_b64 = base64.standard_b64encode(photo.read_bytes()).decode("utf-8")
        client = anthropic.Anthropic()  # resolves API key or `ant auth login` profile
        try:
            response = client.messages.create(
                model=API_MODEL,
                max_tokens=16000,
                thinking={"type": "adaptive"},
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {"type": "base64", "media_type": media_type, "data": image_b64},
                            },
                            {"type": "text", "text": PROMPT},
                        ],
                    }
                ],
            )
        except anthropic.AuthenticationError as exc:
            raise RecognizerUnavailable(f"anthropic API auth failed: {exc}") from exc
        text = next((b.text for b in response.content if b.type == "text"), "")
        return extract_json(text)


class RecognizerChain:
    """Tries recognizers in order; the first that is available AND succeeds wins."""

    def __init__(self, recognizers: list[Recognizer]) -> None:
        self._recognizers = recognizers

    def recognize(self, photo: Path) -> tuple[dict, str]:
        """Return (recognition dict, recognizer name) or raise RecognizerUnavailable."""
        failures: list[str] = []
        for rec in self._recognizers:
            if not rec.available():
                failures.append(f"{rec.name}: not available")
                continue
            try:
                return rec.recognize(photo), rec.name
            except RecognizerUnavailable as exc:
                failures.append(f"{rec.name}: {exc}")
        raise RecognizerUnavailable("; ".join(failures))


def extract_json(text: str) -> dict:
    """Pull the outermost JSON object out of a model reply (tolerates fences/prose)."""
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise RecognizerUnavailable(f"no JSON object in model reply: {text[:200]!r}")
    return json.loads(text[start : end + 1])


@dataclass(frozen=True)
class SpikeResult:
    """One photo's recognition + validation outcome, as written to the outbox."""

    photo: str
    recognizer: str
    recognition: dict
    report: ValidationReport

    def to_json(self) -> dict:
        return {
            "photo": self.photo,
            "recognizer": self.recognizer,
            "recognition": self.recognition,
            "validation": {
                "ok": self.report.ok,
                "issues": list(self.report.issues),
                "moves": self.report.moves,
                "branches": self.report.branches,
                "comments": self.report.comments,
            },
        }


class SpikeRunner:
    """Drives recognize -> validate -> persist for a batch of page photos."""

    def __init__(self, chain: RecognizerChain, validator: StudyValidator, outbox: Path) -> None:
        self._chain = chain
        self._validator = validator
        self._outbox = outbox

    def run(self, photos: list[Path]) -> int:
        """Process each photo; return the number that failed recognition or validation."""
        self._outbox.mkdir(parents=True, exist_ok=True)
        failures = 0
        for photo in photos:
            print(f"\n== {photo.name} ==")
            try:
                recognition, recognizer_name = self._chain.recognize(photo)
            except RecognizerUnavailable as exc:
                print(f"  recognition failed: {exc}")
                failures += 1
                continue
            extraction = PageExtraction(
                fen=str(recognition.get("fen", "")),
                movetext=str(recognition.get("movetext", "")),
                intro=str(recognition.get("intro", "")),
                source=photo.name,
            )
            report = self._validator.validate(extraction)
            result = SpikeResult(photo.name, recognizer_name, recognition, report)
            out_path = self._outbox / f"{photo.stem}.json"
            out_path.write_text(json.dumps(result.to_json(), indent=2))
            (self._outbox / f"{photo.stem}.pgn").write_text(extraction_to_pgn(extraction))
            print(f"  via {recognizer_name}")
            print(f"  fen: {extraction.fen}")
            print(f"  {report.summary}")
            for note in recognition.get("uncertainties") or []:
                print(f"  model unsure: {note}")
            print(f"  -> {out_path.relative_to(ROOT)}")
            failures += 0 if report.ok else 1
        return failures


def extraction_to_pgn(extraction: PageExtraction) -> str:
    """Render an extraction as an importable annotated PGN (Lichess study, any GUI)."""
    intro = f"{{ {extraction.intro.strip()} }} " if extraction.intro.strip() else ""
    return (
        f'[Event "Book study: {extraction.source}"]\n'
        f'[SetUp "1"]\n'
        f'[FEN "{extraction.fen}"]\n\n'
        f"{intro}{extraction.movetext.strip()} *\n"
    )


def collect_photos(args: list[str]) -> list[Path]:
    """Photos from CLI args, or everything image-like in the inbox."""
    if args:
        return [Path(a) for a in args]
    INBOX.mkdir(parents=True, exist_ok=True)
    return sorted(p for p in INBOX.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES)


def main(argv: list[str]) -> int:
    sys.stdout.reconfigure(line_buffering=True)  # progress must land even when redirected to a file
    photos = collect_photos(argv)
    if not photos:
        print(f"No photos found. Drop page photos into {INBOX.relative_to(ROOT)}/ and re-run.")
        return 0
    chain = RecognizerChain([ClaudeCliRecognizer(), AnthropicApiRecognizer()])
    failures = SpikeRunner(chain, StudyValidator(), OUTBOX).run(photos)
    print(f"\n{len(photos)} page(s), {failures} needing review.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
