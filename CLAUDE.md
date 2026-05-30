# CLAUDE.md — Chess Style Lab

> Project memory for Claude Code. Read this first. It encodes verified facts,
> exact metric definitions, and gotchas already paid for in blood. Do not
> re-derive these — match them.

## 1. What this is

Engine-free chess **feature analysis**. We quantify *how* a player plays
(positional and behavioral signatures) rather than *how well* (accuracy/centipawn
loss — engines already do that). Strength and style are largely orthogonal; we
measure the style axis.

**Current deliverable:** a self-contained web app that loads a PGN, steps through
it one move at a time (← / → keys), and shows per-side, per-move features plus
running trends. Origin intent: let a ~1500 player *see* how a strong game's
structure differs from a club game's, move by move.

**North star:** a reproducible feature pipeline + "style-space" comparisons across
many players, all on free public data with minimal/no engine.

## 2. Non-negotiable principles

1. **Engine-minimal.** The core path computes features from the board only — no
   Stockfish. Evaluation is a *separate, optional tier* fed exclusively by
   Lichess **cached cloud-eval** (`/api/cloud-eval?fen=…`), never a local engine.
   Only ~3 planned metrics need eval (squeeze index, eval-based defensive
   resourcefulness, accuracy-under-pressure); everything else stays pure board logic.
2. **Style ≠ strength.** Don't reach for "accuracy" or "blunder rate" as core
   features. Measure structure and behavior.
3. **Python is the canonical reference; JS must match it.** Every feature has a
   `python-chess` reference. The browser JS engine must reproduce it *exactly* on
   the golden FENs in §6. Parity is a tested invariant, not a hope. When adding a
   feature: implement in Python, mirror in JS, add a golden value, then wire UI.
4. **Free public data only.** See §8.
5. **Zero-ambiguity outputs.** Every metric is defined here. No undocumented magic.

## 3. Current state

- `web/index.html` — today this is ONE self-contained file (engine + parser + UI +
  two sample games + Chart.js/chess.js via cdnjs). First refactor task is to split
  it per §4 without changing behavior.
- Feature engine and PGN parser are verified (§6, §7). chess.js is used ONLY for
  legal-move application; all features are our own code.
- **Documented limitation:** en-prise counting flags sound sacrifices and outright
  blunders identically (the Morphy game lights up as "exposure" because it's a
  sacrificial brilliancy). Disambiguating sac vs blunder requires the eval/outcome
  overlay — this is a feature of reality, not a bug. The app's read-out already
  distinguishes "was down N, recovered → sacrifice" from "down N, never recovered →
  blunder" via the worst-deficit metric.

## 4. Proposed repo layout

Dual-language by design (Python = canonical/batch, JS = interactive). Adjust freely,
but keep the parity boundary.

```
chess-style-lab/
  CLAUDE.md
  README.md
  web/                      # interactive stepper (client-side)
    index.html
    src/engine.js           # feature engine — port of the verified inline code
    src/parser.js           # PGN tokenizer + chess.js move application
    src/app.js              # UI / board / chart / aggregates
    test/parity.mjs         # asserts golden values (§6) in JS
  engine/                   # canonical reference + batch pipeline
    pyproject.toml
    chesslab/
      features.py           # reference feature engine (source of truth)
      cloud_eval.py         # optional Lichess cached-eval client (rate-limited)
      pipeline.py           # batch over PGN dumps -> parquet/DuckDB
    tests/
      test_features.py      # golden values (§6)
      test_parity.py        # JS vs Python agree across a FEN corpus
  data/
    samples/{opera.pgn,club.pgn}
    dumps/                  # large Lichess/TWIC files — GITIGNORED
  notebooks/                # exploration only, never the source of truth
```

## 5. Commands

```bash
# interactive app (no build step today — it's static)
python3 -m http.server -d web 8000      # then open http://localhost:8000

# python engine
cd engine && pip install -e . && pytest # golden + parity tests must stay green

# parity (JS side)
node web/test/parity.mjs
```

Keep it framework-light. A bundler (vite) is optional and only if `src/` modules
grow; the current cdnjs `<script>` approach works.

## 6. Feature engine spec — CANONICAL

These definitions are the contract. Both languages implement them identically.

- **Piece values:** P=1, N=3, B=3, R=5, Q=9, K=0.
- **Board representation:** `grid[file][rank]`, file 0=a…7=h, rank 0=rank1…7=rank8.
  Build from FEN (NOT from chess.js `.board()` — see §7). Cell = `{type, color}` or null.
- **`attackers(grid, f, r, color) -> [pieceTypes…]`** — our own attack generation
  (do not rely on chess.js): pawn diagonals (a `color` pawn one rank *behind* the
  target diagonally), knight offsets, king offsets, sliding bishop/queen along the
  4 diagonals until first blocker, rook/queen along the 4 orthogonals until first
  blocker. Return the list of attacking piece types (needed for min-attacker value).

Per side (`sideFeats(grid, color)`):

| Field      | Definition |
|------------|------------|
| `control`  | # of the 64 squares attacked by ≥1 of `color`'s pieces |
| `space`    | controlled squares in the *opponent's half* (White: rank ≥ 5 i.e. r≥4; Black: rank ≤ 4 i.e. r≤3) |
| `center`   | sum of `color`'s attackers over {d4,e4,d5,e5} |
| `hang_ct` / `hang_val` | non-king pieces of `color` that are en prise: attacked AND (undefended OR cheapest attacker value < piece value). Count and summed value. |
| `kp`       | king-zone pressure = sum of enemy attacker counts over the king square + its 8 neighbors (lower = safer) |
| `shield`   | own pawns on the ≤3 files around the king, within 2 ranks in front |
| `mat`      | sum of piece values |
| `dev`      | knights+bishops NOT on their home squares (W: b1,g1,c1,f1; B: b8,g8,c8,f8) |
| `castled`  | king off its home square and on g- or c-file (g1/c1/g8/c8) |

Shared: **`tension`** = # of occupied squares that are simultaneously attacked by the
enemy AND defended by the owner (contested pieces/pawns).

`features(grid) -> { w: sideFeats, b: sideFeats, tension }`. Keep this signature when
porting — it's the tested API.

**Move attribution (per ply transition):**
- **exposure** (a.k.a. "left en prise"): mover's `hang_val` at ply *i* > at ply *i−1*.
  ⚠ flags sacs AND blunders — see §3.
- **worst deficit**: max over plies of (opponent `mat` − own `mat`). A deficit that
  never recovers is the cleanest club-vs-master signal.
- move tags from SAN: capture (`x`), check (`+`), mate (`#`), castle (`O-O`), develops (`dev` rose).

### Golden tests — MUST pass in both languages

Start position `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`:
`w/b` both → control 22, space 0, center 0, hang_ct 0, hang_val 0, shield 3, mat 39; tension 0.

Parity FEN `r2qk2r/ppp2pp1/2np3p/2b1p2n/2B1P1bB/3P1N2/PPPN1PPP/R2Q1RK1 w kq - 4 9`:
- W: control 38, space 11, center 6, hang_ct 0, hang_val 0, kp 1, shield 3, mat 39
- B: control 38, space 10, center 5, hang_ct 1, hang_val 9, kp 3, shield 2, mat 39
- tension 6

(This is the club game after 8…Nh5 — Black's queen is the hanging value-9 piece.)

## 7. PGN parsing — gotchas (chess.js 0.10.3 via cdnjs)

The library is loaded from `cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js`
(global `Chess`). Hard lessons:

- **Do NOT use `load_pgn`.** 0.10.3 requires a blank line after the header block and
  fails silently otherwise — this caused the original empty-app crash. Instead:
  tokenize the movetext ourselves and apply each move with
  `chess.move(san, {sloppy:true})`.
- **Build positions from `chess.fen()` → `fenToGrid`**, not `chess.board()` (version-dependent).
- **Tokenizer must strip:** `[headers]`, `{comments}`, `;comments`, `(variations)`,
  `$NAGs`, result tokens including a bare `*`, move numbers (`\d+\.+`), and trailing
  `+ # ! ?`. Normalize `0-0`→`O-O`.
- **Fallback for odd SAN:** if `move()` returns null, match against
  `chess.moves({verbose:true})` by piece+destination, honoring any file/rank
  disambiguation hint, accepting only a unique candidate. (Handles over-disambiguated
  notation like `Ngf3` that 0.10.3 rejects.)
- Always **guard `render()`** against empty state so a failed paste can't throw on
  the next keypress; surface the parse error in the UI instead.

Verified to parse: both built-ins, Lichess exports ending in `*`, embedded
comments/variations, promotions, over-disambiguated SAN.

## 8. Data sources (free / public)

- **Lichess Open DB** — monthly PGN dumps of all rated games (CC0); evaluations DB;
  `/api/cloud-eval` (cached evals, no engine run); opening explorer / masters API.
- **Chess.com Published-Data API** — `api.chess.com/pub/player/{handle}/games/{yyyy}/{mm}` (PGN, no auth). Online games carry per-move clocks (`%clk`).
- **TWIC**, **Caissabase** — OTB master game collections.
- Online games have clocks; most OTB games don't (matters for any time-based feature).

## 9. Design system (keep UI cohesive)

- Fonts (Google Fonts): **Fraunces** (display/headings), **Hanken Grotesk** (UI/body),
  **IBM Plex Mono** (all numbers/values). Avoid Inter/Roboto/Arial.
- Theme = warm "analytical instrument" on paper. CSS vars:
  `--paper #F4F0E7`, `--ink #211C16`, White-player accent `--w #9A3B2E` (oxblood),
  Black-player accent `--b #1F5673` (deep blue), board `--lsq #EAE0C8` / `--dsq #B59169`.
- Chart convention: White = solid oxblood line, Black = dashed deep-blue line
  (color + dash, never color alone).

## 10. Roadmap

**Immediate (refactor + small wins)**
- Split `index.html` into `web/src/{engine,parser,app}.js` with no behavior change.
- Stand up `engine/chesslab/features.py` as the reference + `tests/test_features.py`
  asserting §6 golden values; add `test_parity.py` (JS vs Python over a FEN corpus).
- "Load two PGNs side by side" mode for direct curve overlay (the real strong-vs-1500 view).
- Export per-position feature rows to CSV; later to Postgres (`sundar_os`-style schema).

**Band-2 positional features (next, engine-free)** — implement with the same
Python-first → JS-mirror → golden-test workflow. Exact algorithms:
- **Per-piece mobility:** for each own piece, # of pseudo-legal destination squares
  (its attack set minus own-occupied). Symmetric across both sides (no turn flip).
- **Outpost (key squares):** a square in the enemy half, defended by an own pawn, and
  unreachable by any enemy pawn (no enemy pawn on adjacent files that can advance to
  it). Count knight-on-outpost occurrences + duration.
- **Good/bad bishop:** `mobility / (1 + own pawns on the bishop's color complex)`.
- **Rook activity:** rooks on open/semi-open files; 7th-rank frequency.
- **Initiative ratio:** fraction of a side's moves that are checks, captures, or
  create a new threat.
- **Tension-holding:** mean lifetime of pawn captures a side declines to resolve.

**Band-3 / pipeline (later)**
- Complexity-seeking index (branching+tension of chosen move vs mean over legal alternatives).
- Eval-optional tier via cached cloud-eval (squeeze index, defensive save-rate).
- Batch pipeline over Lichess dumps → Parquet/DuckDB → per-player feature vectors →
  factor analysis → style-space atlas (UMAP/PCA + radar comparisons).

## 11. Conventions & do-nots

- DO keep the Python engine the source of truth; never let JS and Python drift.
- DO add a golden value for any new feature before wiring it into the UI.
- DO write all code object-oriented and to best practices — see §13, it's non-negotiable.
- DO let tests run automatically; don't ship a change the suite hasn't validated.
- DO finish every change set the same way (see §15): append a timestamped entry to
  `change-log.md`, then commit and push.
- DON'T introduce a charting/board library that pulls from a non-allowlisted CDN;
  the app must stay openable as a static file.
- DON'T use browser storage (localStorage/sessionStorage) in the web app — keep
  state in memory.
- DON'T silently swallow parse failures — show them.
- DON'T add engine eval to the core path; it goes in the optional tier only.
- DON'T hand-run tests as the safety net or merge red — the automatic suite is the gate.

## 13. Engineering standards — NON-NEGOTIABLE

These apply to **every** line of code in this repo, both languages. They are
peers of the §2 principles, not suggestions.

### Object-oriented, by best practices
- **Model with classes, not loose functions.** Core domain objects: `Board`
  (the `grid[file][rank]` representation + FEN construction + `attackers`),
  `Piece` (type/color/value), `SideFeatures` / `PositionFeatures` (immutable value
  objects holding the §6 fields), `FeatureEngine` (computes features from a `Board`).
  The JS port mirrors the same class boundaries.
- **SOLID & clean code.** Single responsibility per class; small, named methods over
  long procedures; no god objects; depend on abstractions where it buys testability.
  Prefer immutable value objects (frozen dataclasses / readonly) for feature results.
- **Parity wrappers.** §6 documents a functional API (`features(grid)`,
  `sideFeats(grid,color)`) as the *tested contract*. Keep those as thin
  module-level wrappers that delegate to the classes — the contract and the OO
  design coexist; neither is sacrificed.
- **Type everything** (Python type hints; JSDoc/`@ts-check` or TS on the JS side).
  No untyped public methods. Docstrings on every public class/method.

### Testing is automatic, not on-demand
- **The suite runs itself.** A `PostToolUse` hook (`.claude/settings.json`) runs the
  test runner after any code edit; CI / pre-commit do the same outside the session.
  Tests are the gate — not something a human remembers to invoke.
- **Test-first for features.** Per §11: add the golden value, write the failing
  test, then implement until green. Never wire a feature into the UI before its
  golden test passes in *both* languages.
- **What must always be green:** §6 golden values (Python `pytest`), JS golden
  values (`node web/test/parity.mjs`), and Python↔JS parity over the FEN corpus.
- **Coverage is a floor, not a trophy.** Every public method has a test; every new
  feature ships with golden + parity coverage. A red suite blocks the change.
- **One command runs all of it:** `./run_tests.sh` (or `make test`) executes the
  Python suite and the JS parity runner; the hook calls this. Keep it fast and
  dependency-light so it can run on every edit.

## 14. Feature-registry architecture (the catalog backbone)

The full feature ambition lives in **`FEATURE_CATALOG.md`** (the T0–T6 ladder + the
per-feature metadata schema); the build plan is `/.claude/plans/deep-splashing-sparrow.md`.
Key structural facts (don't re-derive):

- **`engine/chesslab/features.py` stays the canonical math** and the JS-parity source
  of truth. It is NOT moved or rewritten.
- **`engine/chesslab/registry.py`** is the framework: `Feature` ABC (generic over its
  context type) + scope subclasses (`PositionFeature`/`MoveFeature`/`GameFeature`/
  `CorpusFeature`), `FeatureMeta`, `FeatureResult`, `Evidence`, the scope contexts, and
  `FeatureRegistry` (validates: complete meta, acyclic `depends_on`, no upward-scope
  deps; provides toposorted compute order + a `feature_set_version` hash).
- **Two orthogonal axes:** *Scope* = POSITION ⊂ MOVE ⊂ GAME ⊂ CORPUS (nesting/compute
  order). *Capability* = CLOCK/EVAL/REF as optional providers on the context. A feature
  declares `requires`; missing provider ⇒ result status `unavailable`, never an error.
  Core features declare `requires=frozenset()` — this is the wall keeping eval out of
  the core path (§2).
- **Registered features live in `engine/chesslab/catalog/`** (named `catalog/`, NOT
  `features/`, because `features.py` already occupies that name). `catalog/board.py`
  holds the BOARD-tier features (delegating to the engine); `build_default_registry()`
  assembles + validates them. **22 board features implemented so far** (T0–T3, all
  engine-free, JS-parity): the original 10 plus `center_occ, islands, isolated,
  doubled, passed, rook_open, mobility` (batch 1), `outpost, bishop_quality (float),
  coordination, colour_complex` (batch 2), and `in_check`. Mobility is cross-checked
  against a python-chess oracle in `tests/test_structure.py`. The **board-tier T0–T3
  set is complete.**
- **MOVE/GAME/CLOCK/EVAL tier (backend-only, 12 features):** computed by
  `chesslab/assembly.py::MoveAssembler` (running state over the move sequence +
  per-position legal-move stats + clocks the pipeline captures), driven by the
  orchestrator — NOT the per-position engine. Declared in `catalog/move.py`
  (`AssemblyFeature`, scope GAME) for the manifest; their `compute` is never called.
  **Not mirrored in JS** — backend mode only.
  - MOVE: `DYN.initiative`, `DEC.prophylaxis`, `DEC.trade_discipline`, `DEV.tempo_waste`,
    `STR.tension_hold`, `TAC.density`, `TAC.exposure` (own-hang-increase count — a cheap
    proxy, not SEE), `MAT.swing` (|Δ material balance|).
  - CLOCK (`requires={CLOCK}`): `TIM.move_time` (%emt), `TIM.clock` (%clk remaining).
    The pipeline parses `%clk` AND `%emt`; the Candidates library JSON is built WITH
    comments so clocks survive to the backend.
  - EVAL (`requires={EVAL}`, `engine=cached-eval-optional`): `EVAL.acpl` (mean centipawn
    loss), `EVAL.consistency` (stdev of loss), consuming PGN `%eval`. Capability-gated:
    emit `status=unavailable` + value `None` when the game lacks the data (the Candidates
    PGNs have clocks but no `%eval`, so EVAL shows "needs eval data" for them).
  - Still pending: filling EVAL via cached cloud-eval for games without `%eval`
    (`cloud_eval.py`, batch-only); SEE-based exposure; corpus/profiles.
- `FeatureMeta.higher` (good|bad|neutral) feeds the UI's favour/comparison column; the
  JS `HIGHER` map covers board features, the manifest's `higher` covers backend-only ones.
- **Sticky features** (`orchestrator.STICKY_MAX` / `analysis.js STICKY_MAX`): `KSF.castle`
  is carried forward as a non-decreasing per-side value — once a side castles it stays
  "castled" even if the king later moves. Add other monotonic features to this set.
- **UI feature table** is fixed-layout (`table-layout:fixed` + colgroup): a reserved
  delta slot keeps value columns from shifting; a `±` column shows which side each
  feature favours (from the JS `HIGHER` map), with a tally in the panel header.
- **Storage is behind `engine/chesslab/store/FeatureStore`** — `FileFeatureStore`
  (per-game JSON artifacts) now; `DuckDBFeatureStore` (Parquet + SQL) for the corpus
  phase; Postgres later. Feature/orchestration code depends only on the interface.
- **`features.yaml` (generated from the registry) is the single source of truth the UI
  and pipeline consume** — like `golden.json`, generate-and-sync-test it; never edit by
  hand.
- **Two parsers diverge on purpose:** the JS quick-mode parser keeps stripping comments;
  the Python pipeline parser MUST preserve `%clk`/`%eval` into the moves data. The JS
  engine mirrors only the BOARD tier (offline quick mode); MOVE/GAME/CORPUS/EVAL/CLOCK
  features are backend-only by design — do not port them to JS.

## 15. Change log & delivery workflow — DO THIS EVERY TIME

Every **set of changes** ends the same way — this is mandatory, not optional:

1. **Tests green.** `./run_tests.sh` passes (the suite is the gate, §13).
2. **Append to `change-log.md`.** Add a new entry at the **top** (newest first) with a
   timestamp (`date '+%Y-%m-%d %H:%M %Z'`) and a title. Every entry states both:
   - **What** — the concrete change (files/features/behavior).
   - **Why** — the reason or trigger (the problem it fixes, the request, the goal).
   One entry per change set; keep it scannable.
3. **Commit and push.** Stage everything, write a clear commit message (end with the
   `Co-Authored-By: Claude` trailer), and `git push` to `origin/main`
   (`git@github.com:sundarm710/chess.git`).

Do not leave finished work uncommitted. If a change set spans several edits, it's still
one change-log entry + one commit at the end. Regenerate `features.yaml` (run the suite)
before committing so it stays in sync.

## 12. Glossary

- **en prise** — a piece sitting where it can be profitably captured (attacked and
  under-defended).
- **space** — squares you control in the opponent's half of the board.
- **outpost / key square** — an advanced square a pawn can't challenge, ideal for a knight.
- **tension** — unresolved mutual captures (contested pieces/pawns) left on the board.
- **king-zone pressure** — enemy attackers on the king and its 8 surrounding squares.
- **exposure event** — a move that leaves the mover's own material en prise (sac or blunder).
- **worst deficit** — the largest material a side was ever behind by.
