# Book Trainer — photo → position → guided variation practice

> Design doc for the book-trainer tier. Approved plan:
> `~/.claude/plans/so-i-read-chess-steady-castle.md` (2026-07-03). This file is the
> repo-resident summary; update it as phases land.

## What this is

Photograph a chess-book page on the phone → recognize the printed diagram as a FEN and
the author's analysis as an annotated variation tree → put the position on the app's
board → play moves against it and get the author's own commentary as feedback: why a
line fails, the refutation, the opponent's reply. Off-book moves get an honest "the
author doesn't cover this" (author-only in v1 — no eval/LLM verdicts).

## Decisions (locked 2026-07-03)

- **Recognition:** Claude vision. Primary path = **Claude Code subscription** via
  headless `claude -p` (no per-token cost); fallback = **Anthropic API**
  (`claude-opus-4-8`). Abstracted behind a `Recognizer` interface.
- **Off-book:** author-only in v1. Eval fallback (cloud-eval, per the
  `annotate_eval.py` precedent) is a later, optional tier — kept out of the
  interactive loop.
- **Trust boundary:** recognition output is never trusted directly. Every extracted
  line must replay legally from the extracted FEN (`chesslab.study.StudyValidator`),
  and a human-confirm review UI is mandatory before a study is saved.

## Architecture

```
phone camera ──(QR upload page on LAN, FastAPI)──▶ data/studies-raw/inbox/   [gitignored]
      │
      ▼
recognizer (claude -p → API fallback): photo → { fen, intro, annotated movetext }
      │
      ▼
legality cross-check: replay every variation from the FEN (python-chess)
  → any illegal move flags the page "needs_review" instead of silently corrupting it
      │
      ▼
review UI: photo beside rendered board + movetext; fix pieces/text; confirm
      │
      ▼
web/data/studies/<slug>.json  (mirrors the tournament-library pattern, §16)
      │
      ▼
Trainer view: board seeded from full FEN, click-to-move, moves matched against the
variation tree (position-keyed, so transpositions match); author comments in the chip;
off-tree → "author doesn't cover this" + his closest covered line
```

## What exists vs what's greenfield

Build on: the custom board renderer (`web/src/app.js` `renderBoard` + `pieces.js`),
the FastAPI service (`engine/chesslab/api.py`), the library JSON pattern
(`web/data/library.json` + lazy per-collection files), chess.js FEN-seeded
construction, the chip/explain feedback surface, the §9 design system.

Greenfield: all image/vision code; full-FEN game seeding (`Board.fromFen` reads only
placement; games always start from the standard position); a **third, tree-preserving
parser** (both existing parsers strip `(...)`/`{...}` *by design* — do not modify
them, §14); interactive move input (the board is display-only); the review/board
editor; the studies schema.

## Data model

```jsonc
// web/data/studies.json — index
{ "studies": [ { "slug": "book-title-ch3", "book": "...", "chapter": "...", "count": 12 } ] }

// web/data/studies/<slug>.json
{ "slug": "...", "book": "...",
  "positions": [ {
     "id": "<slug>__p03",
     "source": { "photo": "p47.jpg", "page": 47 },
     "fen": "r1bq... w KQ - 0 12",              // full 6-field FEN, human-confirmed
     "intro": "author's framing text",
     "tree": "12.h4!? { comment } (12.Nd5 { main line } ...)",  // annotated PGN movetext
     "orientation": "white",
     "status": "confirmed" | "needs_review"
  } ] }
```

Copyright: photos and raw extractions live under `data/studies-raw/` (gitignored, like
`data/dumps/`). Whether study JSONs are committable is an open question — default no
for whole chapters.

## Phases

- **Phase 0 — feasibility spike: DONE (2026-07-03), verdict POSITIVE.** 5/5 real page
  photos recognized via the subscription `claude -p` path; every extraction (174 moves,
  16 sidelines, 41 comments total) replayed fully legal from its extracted FEN. The
  agent self-verifies (resolves piece ambiguities by contradiction with printed lines,
  infers castling/ep fields with stated evidence, skips the page's second diagram) at
  a cost of ~5–15+ min/page — one dense page needed the CLI timeout raised to 1800 s.
  Known weaknesses to design around: (1) squares no printed line touches are
  unverifiable → the review UI stays mandatory; (2) comments are sometimes paraphrased,
  not verbatim → tighten the prompt; (3) analysis spills across pages → Phase 2 needs
  multi-page stitching. Stopgap practice path: the spike also emits importable
  annotated PGNs (`data/studies-raw/out/*.pgn`) for Lichess studies / any GUI.
- **Phase 1 — study model + trainer core.** Tree model + tree-preserving parser
  (Python canonical → JS mirror → golden fixtures), full-FEN seeding, click-to-move,
  Trainer view. Works with hand-authored study JSONs — independent of Phase 0.
- **Phase 2 — ingestion pipeline.** `Recognizer` productionized, FastAPI `/studies`
  endpoints, review/correction UI, save to the studies library.
- **Phase 3 — phone capture.** QR-code LAN upload page → inbox → auto-ingest queue.
- **Phase 4 — progress layer.** Attempt history, error patterns → "work on X";
  optional eval tier for off-book verdicts.

## House-rule fit

New capability tier like EVAL/CLOCK — the engine-free wall around the core feature
path (§2) is untouched; the trainer consumes author text, not engine output. OO +
golden tests (§13) apply to the deterministic parts (tree parser, matcher, validator);
the vision layer is guarded by the legality validator + labeled photo fixtures, since
LLM output isn't exact-golden testable.
