# Change log

Running log of what changed, newest first. One entry per set of changes (see
`CLAUDE.md` §15). Every entry states **What** (the change) and **Why** (the reason),
and each set is committed + pushed.

---

## 2026-05-30 11:45 IST — Tournament profiles (cross-player aggregation) — MVP

- **What:**
  - New `engine/chesslab/aggregate.py`: a generic **reducer spine** — each feature
    declares an `aggregation` (`end|mean|max|min|sum`, defaulted by scope); `summarize()`
    reduces a game's per-ply matrix to one value per (feature, side); `tournament_profile()`
    rolls players up (mean/stdev/95%-CI, by-colour/result, standings + linear TPR) and emits
    pre-sorted leaderboards. So "who is most X" = pick feature X.
  - `scripts/build_profiles.py` → `web/data/profiles/<slug>.json` (committed, lazy-loaded);
    `web/src/profiles.js` + a **Game / Profiles** tab (`#profiles/<slug>` deep-link) rendering
    a generic leaderboard (bars + n-badge + CI + min-n greying) and standings.
  - `FeatureMeta.higher`/`aggregation` now set on the Python board features and surfaced in
    the manifest (the Python manifest is authoritative for direction; clock→min, swing/
    move-time→max, density→mean, castle→max). Capability gating propagated to leaderboards
    (Grand Swiss/Norway `TIM.*` disabled; `EVAL.*` disabled everywhere).
  - Tests: `test_aggregate.py` (reducer resolution/summarize/rollup math) + `profiles.test.mjs`
    (shape, sort direction, gating, min-n). Suite green; mypy clean.
- **Why:** Answer tournament-wide, cross-player questions (most space, time trouble,
  prophylaxis, prepared, …) generically — a new feature flows into profiles for free.
  MVP-first (pure-Python → static JSON; DuckDB corpus store + radar/scatter/Elo-normalization
  are the planned depth, off by default). Known source-data issue: `women/round-14` holds the
  Open round-14 games (8 phantom 1-game "players" in the women profile; min-n keeps them off
  the leaderboards) — flagged for cleanup.

## 2026-05-30 10:24 IST — Multi-tournament library, data reorg, two-level filter

- **What:**
  - Reorganized `data/` into `raw/` (untouched source PGNs) and `tournaments/<slug>/`
    (generated per-round extracts). Added **FIDE Grand Swiss 2025** (638 games) and
    **Norway Chess 2026** (12) alongside the Candidates; moved `norway26.pgn` into `raw/`.
  - New `scripts/build_library.py` (replaces `build_candidates.py`) with a hardcoded
    `SOURCES` manifest → emits `web/data/library.json` (tournament index) + lazy-loaded
    `web/data/t/<slug>.json` per tournament. Game ids now `<slug>__r<RR>b<BB>`.
  - Frontend: **two cascading filters** — tournament · section → round · game — plus a
    Custom PGN option. **Removed the two built-in sample games.** Deep links use the new
    id format. CLAUDE.md §16 documents the layout, metadata schema, and id format.
  - Fixed a build bug: a reused `StringExporter` accumulated across games (440 MB blow-up)
    → fresh exporter per game.
- **Why:** Scale the games library beyond one tournament and make it navigable by the
  metadata that matters (tournament/section, then round/game), the way a user actually
  browses. Splitting index from per-tournament files keeps the initial load tiny while
  supporting hundreds of games. Removing samples makes the library the single source.

## 2026-05-30 10:14 IST — Fix CI install + change-log What/Why format

- **What:** `.github/workflows/tests.yml` now installs `.[dev,pipeline]` (was `.[dev]`).
  CLAUDE.md §15 updated to require an explicit **What** and **Why** per entry; existing
  entries reformatted to match.
- **Why:** GitHub Actions was failing — the suite gained backend/pipeline dependencies
  (`PyYAML` for `features.yaml` generation, `python-chess`/`fastapi` for the
  orchestrator/API tests), but CI only installed the `dev` extra, so imports failed.
  Verified the fix by running the suite in a clean venv with `python3` fallback (green).

## 2026-05-30 09:59 IST — MOVE / CLOCK / EVAL feature tier + change-log workflow

- **What:**
  - New MOVE features via `chesslab/assembly.py::MoveAssembler` (backend-only):
    `MAT.swing`, `TAC.exposure`, `DEV.tempo_waste`, `STR.tension_hold`,
    `DEC.trade_discipline` — with `DYN.initiative`/`TAC.density`/`DEC.prophylaxis`
    refactored into the same assembler.
  - CLOCK tier (`requires={CLOCK}`): `TIM.move_time` (`%emt`), `TIM.clock` (`%clk`).
    Pipeline parses `%emt`; the Candidates library JSON rebuilt **with comments** so
    clocks reach the backend.
  - EVAL scaffold (`requires={EVAL}`, gated): `EVAL.acpl`, `EVAL.consistency` from
    `%eval`. 34 features total; `FeatureMeta.higher` added. UI feature list scrolls
    within its column (sticky header). New `change-log.md`; CLAUDE.md §15 added.
- **Why:** Round out the feature catalog beyond the board tier — capture behavioral
  (initiative, prophylaxis, tension-holding) and time-usage signals that distinguish
  strong play, using the clocks already present in the Candidates PGNs. The change-log
  workflow was requested to track work and keep `origin/main` current.

## 2026-05-29 — Project baseline (initial commit `bc83ad8`)

- **What:** Engine-free positional feature engine (Python `chesslab`) + parity-tested JS
  mirror; feature registry + orchestrator → per-ply explainability JSON; FastAPI backend;
  `FileFeatureStore`. ~22 board-tier features (T0–T3) + 3 initial MOVE features. Frontend:
  registry-driven feature table, explanation panel, trend chart, comparison/favour tally,
  lichess cburnett pieces. 2026 FIDE Candidates library (112 games) with grouped picker +
  deep links. Automatic test suite + README; first push to GitHub.
- **Why:** Establish a reproducible, tested foundation for measuring chess *style* (how a
  player plays) rather than strength — on free public data, engine-minimal.
