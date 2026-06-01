# Change log

Running log of what changed, newest first. One entry per set of changes (see
`CLAUDE.md` §15). Every entry states **What** (the change) and **Why** (the reason),
and each set is committed + pushed.

---

## 2026-06-01 — Phase filter now drives the per-game breakdown

- **What:** The Opening/Middlegame/Endgame filter previously moved the matrix, takeaway,
  Winning DNA and radar but **not** the per-game breakdown (it showed whole-game values) — so
  it looked like the filter was broken there. Now the breakdown is phase-aware:
  - `aggregate.tournament_profile` emits per-game **`phase_vals`** (the game's per-phase value
    per feature), **gated to cross-eligible / small dense fields** like the cross (Candidates
    yes; Grand Swiss keeps whole-game only, with a caption, to bound JSON size).
  - `PlayerGames` reads the current phase's per-game value, recomputes the **Mean** from it
    (so it still reconciles with the phase-sliced matrix), and colours cells against the
    **same slice's** field range. Caption shows "· Endgame only" (or notes whole-game where
    per-phase data isn't stored). New `test_aggregate` checks (present + reconciles; dropped on
    sparse fields).
- **Why:** Direct fix to the reported "filter isn't working" — the matrix and the drill-down
  now move together under the phase filter, and the Mean still equals the matrix value. Rebuilt
  profiles (Candidates ~424 KB; Grand Swiss unchanged ~2 MB).

## 2026-06-01 — Drill-down → game deep link + heatmap colour fix (web-next)

- **What:**
  - **Click a breakdown row → open that game in the stepper** (`App.openGame` switches to the
    Game view, loads the game's tournament, and sets `#<id>@0`). Opponent names are dotted-
    underlined as the affordance.
  - **Fixed the breakdown heatmap going blue/purple:** `cellColor` now **clamps** goodness to
    [0,1]. The matrix colours by the field's *mean* range, but a single game's value can exceed
    any player's mean → goodness > 1 → the `hsl(g·120°)` hue ran past green into cyan/blue/
    purple. Clamping keeps the breakdown on the same red→green scale as the matrix.
  - **Retired off-theme chart colours:** the categorical `PALETTE` (radar / trajectory) dropped
    the purple/indigo for warm earthy tones; White (oxblood) and Black (deep blue) still lead.
- **Why:** Direct response to feedback — the drill-down's colours diverged from the main table
  (the clamp bug) and the radar used purple that clashed with the warm theme; and being able to
  jump from a suspicious per-game number straight into the move-by-move stepper closes the
  "this looks off → see why" loop. web-next only; build + Vitest green.

## 2026-06-01 — Player per-game drill-down (Profiles)

- **What:** Clicking a player name in the Profiles matrix now opens a **per-game breakdown**
  in the space between the matrix and the player radar: one row per game (round · opponent ·
  W/D/L · colour), every feature a column (colour-coded vs the field, like the matrix), and a
  bold **Mean** row that equals that player's value in the matrix above. Respects the colour
  filter (filters to White/Black games so the mean still reconciles); notes when a phase
  filter is active that per-game values are whole-game.
  - **Data:** `aggregate.tournament_profile` now emits `game_rows` per player (id, round,
    colour, opponent, result, score, and per-feature whole-game values, 2 dp). Rebuilt all
    profiles. New `test_aggregate` check that the per-game values' mean reconciles with the
    rollup mean.
  - **web-next:** new `PlayerGames` component; matrix player names are clickable + highlight.
- **Why:** The matrix shows one number per player·feature with no way to see how it was
  reached — a club player can't tell a consistent trait from one outlier game. The breakdown
  is the "show your work" that makes each cell trustworthy and turns "scan the field" into
  "study a player". Note: Grand-Swiss profile JSON grows to ~2 MB (per-game data; ~300 KB
  gzipped, lazy-loaded per tournament); Candidates ~230 KB.

## 2026-06-01 — `web-next/` full parity with the vanilla app (Game view + Profiles charts)

- **What:** Ported every remaining piece of `web/` into the React/TS spike.
  - **Engine reuse:** copied `engine.js / parser.js / highlights.js / catalog.js / analysis.js /
    pieces.js / api.js` verbatim into `src/engine/` (typed via `allowJs`); pinned **chess.js
    0.10.3** (the parser's API) so offline feature math can't drift from the canonical engine.
    Typed wrapper `engine/game.ts` exposes `analyzeQuick`/`analyzeBackend`.
  - **Game view** (`GameView` + `components/game/*`): board (cburnett SVG, move + feature
    highlights), ←/→ stepper + counter, category-grouped feature table (per-side values, coloured
    deltas, favour tally), explanation panel ("why it changed"), both-sides trend chart, running
    aggregates + plain reading, round/game picker, custom-PGN paste, **Backend toggle** with
    auto-fallback to offline. Fixes the "table didn't sort / no charts" gaps.
  - **Profiles charts:** added the **player radar** (clustered ≤8 feats/≤8 players), **phase &
    colour** card (trajectory / fingerprint heatmap / White-vs-Black radars), and the **feature
    scatter** — completing parity with the redesigned matrix/Winning-DNA/focus layout.
  - **App shell:** Game/Profiles tabs, shared tournament selector, deep-link hash routing
    (`#profiles/<slug>`, `#<id>@<ply>`). Central Chart.js registration (`lib/chartSetup`).
    `sync-data` now also mirrors `../web/data/t/*` (PGNs). Build + Vitest green.
- **Why:** The first spike only had the Profiles matrix; the user asked to carry over the finer
  touches (sortable table, radar plots, the game stepper, …) so `web-next` is a true side-by-side
  replacement for the `:8000` app to evaluate the migration. Reusing the engine modules keeps the
  parity wall intact — React only owns the view shell.

## 2026-05-30 — `web-next/` Profiles UX redesign (insight-first layout)

- **What:** Reworked the spike from stacked full-width sections into a two-column
  "instrument", giving space in proportion to value:
  - **Takeaway sentence** (`takeaway()`) auto-derived from result-correlation top movers
    ("winners showed more Trade discipline and King-pawn shield; In check and Move time
    tracked losses"), phase-aware.
  - **Matrix as hero** with **category group headers** (Material/Space/King safety/…),
    sortable, sticky header + player column, click-to-focus.
  - **Insight rail:** **Winning DNA** — top ↑/↓ features as compact diverging bars
    (`topMovers()`), replacing the full-height 30-bar chart (now behind a "Show all
    features" toggle); **Focus panel** — the clicked feature's meaning + ranked players
    (`rankedEntries()`).
  - New pure helpers in `lib/profile.ts` (`featuresByCategory`, `rankedEntries`,
    `topMovers`, `takeaway`, `CATEGORY_LABEL`); build + Vitest green.
- **Why:** The "What wins" chart ate ~900px for an answer that's really "the top few
  features" — poor signal-per-pixel — and full-width stacking buried the matrix (the actual
  scan surface). For a club player trying to *understand and improve*, the redesign leads
  with the narrative (takeaway), makes the style-scan the hero, distills "what matters" into
  a glanceable panel, and gives every matrix column a purpose (focus → meaning + ranking).

## 2026-05-30 — `web-next/` frontend spike (Vite + React + TS + Tailwind + TanStack)

- **What:** New `web-next/` proof-of-concept (the existing `web/` is untouched). Ports the
  Profiles **overview matrix** (TanStack Table — sortable, colour-coded, sticky, click-to-focus),
  the **phase + colour filter bar**, and the **What-wins feature↔result correlation** chart
  (react-chartjs-2), on Vite 6 + React 19 + strict TypeScript + Tailwind v4 with the project
  design tokens. Typed profile contract (`types.ts`), pure view-logic (`lib/profile.ts`) with
  **Vitest** unit tests (7 passing), `sync-data` script mirroring `../web/data` (git-ignored).
  Build green (399 kB JS / 128 kB gz; CSS 3.4 kB gz). Pinned Vite to 6 because 7/8 (rolldown)
  need Node 22.12+ (local is 22.9).
- **Why:** The user asked to *feel* the difference between the hand-rolled vanilla UI and a
  modern component stack before deciding on a migration. The spike shows the headline wins —
  the matrix's sort/sticky/virtualization-ready behaviour, declarative chart lifecycle (kills
  the destroy/recreate bug class), compile-checked data, and testable view-logic — at the cost
  of a build step (gives up §11 "openable as a static file"). Kept side-by-side so both run.

## 2026-05-30 — Profiles: game-phase & colour dimensions + what-wins correlation

- **What:**
  - **Phase axis.** `orchestrator.classify_phase(board, ply)` tags every ply
    `opening|middlegame|endgame` (material+move hybrid: tapered `1·minors+2·rooks+4·queens`,
    start 24; opening = move ≤12 & ≥20, endgame = ≤8, else middlegame). `summarize` applies
    each feature's reducer *within* each phase (`FeatureCell.phase_values`); rollups now carry
    `phases:{…:{mean,n}}`.
  - **Colour axis.** Colour marginals promoted to `mean_white/black` + `n_white/n_black`.
  - **Phase × colour cross**, hybrid by field size: full 6-cell `cross` stored only for small
    dense fields (`emit_cross`: Candidates yes, Grand Swiss no); SPA falls back to the phase
    marginal ("approx") where absent.
  - **What-wins correlation.** `result_correlation:{fid:{r,n,phases}}` — tournament-level
    Pearson r between each feature and the game result (win 1·draw 0.5·loss 0), overall + per
    phase. Answers "which features go with winning."
  - **Frontend.** A Phase + Colour **filter row** re-slices matrix/leaderboard/radar/scatter
    via one `sliceValue` accessor (per-slice min-n; client-side re-sort); a new **Phase &
    colour** card (phase-trajectory lines / phase-fingerprint heatmap / White-vs-Black radars)
    and a **What-wins** correlation bar chart.
  - Dropped the now-redundant `mean_won` (superseded by `result_correlation`); slice means at
    2 dp. Rebuilt all profiles. Tests: phase classifier + per-phase reducers (`test_orchestrator`
    /`test_aggregate`), marginals/cross/correlation shape (`profiles.test.mjs`, 641 checks).
- **Why:** A single whole-game mean hides *when* and *with which colour* a player shows a
  trait. Phase + colour slicing lets you see how a player navigates opening→endgame and
  White vs Black, and the result-correlation surfaces which style traits actually track wins
  in a field — all falling out of the generic reducer spine, no per-question code. Cross is
  field-size-gated so thin (n≈3–5) cells never masquerade as signal. Grand-Swiss JSON ~1.07MB
  (no cross; gzips ~180KB), lazy-loaded per tournament.

## 2026-05-30 14:06 IST — Profiles charts: fix scatter update, multi-radar over all features

- **What:**
  - Fixed the scatter (and radar) not updating: `drawScatter`/`drawRadars` now destroy the
    existing Chart.js instance before recreating (Chart.js refuses to mount onto an
    in-use canvas, so the change was silently no-op'ing).
  - Player radar now covers **all** features: they're clustered by category into groups of
    ≤8 (`CLUSTER_MAX`), rendered as **multiple radar plots** (Material·Space, King safety,
    Structure, Development·Activity, Dynamics·Tactics·Decisions·Time). Up to 8 players can
    be selected; a shared colour legend spans the radars; min-n excluded from the
    normalization scale.
- **Why:** A single 8-axis radar hid most features, and the broken scatter looked frozen.
  Clustering shows every feature while keeping each radar readable, and the destroy-then-
  recreate is the correct Chart.js lifecycle.

## 2026-05-30 13:59 IST — Profiles depth: radar, scatter, feature description

- **What:**
  - **Player radar** — checkboxes pick players (top 3 by default); a Chart.js radar
    compares them across a curated 8-feature set (Space, Mobility, Coordination,
    Initiative, Prophylaxis, Tension-holding, King-zone pressure, Hanging), min-max
    normalized so outward = better (bad features inverted).
  - **Feature × feature scatter** — pick X/Y features; every qualified player a dot
    (Chart.js), tooltip names them. Defaults to Initiative × Prophylaxis.
  - **Feature description** now shown under the focused leaderboard (e.g. Space →
    "Territory you control in the opponent's half"); `description` added to the profile
    `meta` map and profiles rebuilt.
  - Charts reuse the already-loaded Chart.js; instances destroyed/recreated on re-render.
- **Why:** The matrix shows everything at once but flat; radar makes head-to-head player
  comparison legible, and the scatter exposes 2-D style planes (e.g. forcing vs
  prophylactic). The description answers "what does this metric mean?" in place.
- Remaining depth (next): opponent-Elo normalization toggle (off by default) + the
  DuckDB corpus store (queryable engine-of-record).

## 2026-05-30 12:15 IST — Profiles fixes: women data, scroll, value wrap

- **What:**
  - Removed `data/raw/candidates2026/women/round-14/` — it was a byte-for-byte duplicate
    of the Open round-14 games (the women's real round 14 isn't in the archive). Women is
    now a clean 13 rounds / 52 games / 8 players; rebuilt library + profiles (758 games).
  - Profiles matrix: clicking a column header no longer rebuilds the matrix — it updates
    the header highlight + the focused leaderboard in place (`focusFeature`), so the
    horizontal scroll position is preserved.
  - Leaderboard value (`.lbval`) is now single-line (`white-space:nowrap`, wider) so wide
    values like "15.54 ±5.43 n=13" no longer wrap and shift the row layout.
- **Why:** Switching to Candidates Women showed the 8 Open players "appended" — that was
  the misfiled round-14 surfacing; removing it fixes it at the source. The scroll reset
  and value-wrap were jarring interaction/layout bugs in the new matrix view.

## 2026-05-30 12:01 IST — Profiles overview matrix (all features at a glance)

- **What:** Reworked the Profiles view (`web/src/profiles.js`) from a single-feature
  leaderboard into an **overview matrix** — every player a row, every available feature a
  column, each cell colour-coded by the player's standing within that column (green good →
  red bad, respecting `higher`; neutral features uncoloured). Leading Pts/TPR columns,
  category-grouped feature columns with separators, sticky player column + header,
  horizontal/vertical scroll. Clicking a column header drills into that feature's ranked
  leaderboard (kept below). Min-n players shown faint and excluded from the colour scale.
- **Why:** Viewing one metric at a time buried the comparison; a player×feature heatmap
  lets you scan the whole field across all features at once and spot patterns (who's green
  on space but red on king safety, etc.). All client-side from the existing profile JSON —
  no data/backend change.

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
