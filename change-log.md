# Change log

Running log of what changed, newest first. One entry per set of changes (see
`CLAUDE.md` §15 — every change set appends here and is committed + pushed).

---

## 2026-05-30 09:59 IST — MOVE / CLOCK / EVAL feature tier + change-log workflow

- **New MOVE features** (backend-only, via the new `chesslab/assembly.py::MoveAssembler`):
  `MAT.swing`, `TAC.exposure`, `DEV.tempo_waste`, `STR.tension_hold`, `DEC.trade_discipline`
  — refactored the existing `DYN.initiative` / `TAC.density` / `DEC.prophylaxis` into the
  same assembler.
- **CLOCK tier** (`requires={CLOCK}`): `TIM.move_time` (`%emt`) and `TIM.clock` (`%clk`
  remaining). Pipeline now parses `%emt`; the Candidates library JSON was rebuilt **with
  comments** so clocks reach the backend.
- **EVAL scaffold** (`requires={EVAL}`, capability-gated): `EVAL.acpl` (mean centipawn
  loss) and `EVAL.consistency` (stdev of loss), consuming PGN `%eval`. Show "needs eval
  data" for the Candidates games (no `%eval`); cloud-eval filling is the follow-up.
- **34 features total.** `FeatureMeta.higher` added (drives the UI favour column for
  backend-only features). UI: feature list now scrolls within its column (sticky header)
  so the dashboard stays one screen.
- **New file `change-log.md`**; CLAUDE.md §15 added — every change set updates this log
  and is committed + pushed.
- Tests: `assembly`/clock/eval cases added; per-ply orchestrator test made robust
  (asserts every manifest feature present + constant row count). Suite green
  (85 Python · 26 module · 7 parser · 5 analysis · 339 library · 84 parity); mypy clean.

## 2026-05-29 — Project baseline (initial commit `bc83ad8`)

- Engine-free positional feature engine (Python `chesslab`) + parity-tested JS mirror;
  feature registry + orchestrator → per-ply explainability JSON; FastAPI backend;
  `FileFeatureStore`.
- ~22 board-tier features (T0–T3); 3 initial MOVE features.
- Frontend: registry-driven feature table, explanation panel (plain + technical), trend
  chart following the selection, comparison column + favour tally, lichess cburnett pieces.
- 2026 FIDE Candidates games library (112 games) with a grouped picker + deep links.
- Automatic test suite + README + first push to GitHub.
