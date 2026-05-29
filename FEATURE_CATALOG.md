# FEATURE CATALOG & SPEC — Chess Style Lab

> Companion to `CLAUDE.md`. This is the **feature registry framework**: the full
> ladder of features from beginner basics to the elite frontier, each with a
> description and computation, plus the metadata schema to grow every entry into a
> complete technical spec. The catalog cells are filled; the §6–§9 methodology
> sections are deliberately stubs to flesh out later.

---

## 1. Purpose & audience

Reader: a ~2500 player (or the engineer building tools for one) aiming at 2700+.
The catalog spans every level — basic enough that some entries are "500-Elo stuff" —
because a complete feature library is the foundation, and because the basics do not
disappear at the top: they **saturate** and the information moves into their variance,
their conditional behavior, and into higher tiers.

**What actually separates 2500 from 2700+** (orient the whole doc around this):

1. **Error floor & consistency** — fewer mistakes, lower error *variance*, especially
   in long games (moves 30–60) and under time pressure. The single biggest gap.
2. **Conversion of small edges** — turning +0.5 into a full point at a far higher rate.
3. **Defensive resourcefulness** — saving or drawing objectively worse positions.
4. **Preparation as a weapon** — depth, novelty timing, getting fighting positions.
5. **Practical decision-making** — choosing the move that maximizes the *opponent's*
   chance to err, not merely the objective best; calibrating risk to game state.

Crucially, (1)–(3) and (5) are **objective-quality** signals — they need the clock,
the outcome, or cached eval to measure. Hence the catalog's upper tiers cross from
pure-board to eval-assisted. This is structural, not incidental.

## 2. Conceptual model — two axes

Every feature sits at an intersection of:

- **Skill tier (T0–T6)** — the level at which the feature is *informative* (below it,
  too noisy; above it, saturated).
- **Measurement tier** — how it's computed: `BOARD` (single position), `MOVE`
  (transition), `GAME`/`CORPUS` (aggregate), `CLOCK`, `REF` (reference DB), `EVAL`
  (cached cloud-eval). Lower skill tiers are almost entirely `BOARD`; the frontier is
  increasingly `CLOCK`/`REF`/`EVAL`.

Engine policy is unchanged from `CLAUDE.md`: `EVAL` features are an **optional tier**
fed only by Lichess cached cloud-eval, never a local engine.

## 3. Feature record schema (the metadata to fill per entry)

Each catalog entry below fills the starred fields; the full record (for the registry /
DB / docs) carries all of these:

| Field | Meaning |
|-------|---------|
| `id` * | Stable namespaced id, e.g. `STR.tension_hold` |
| `name` * | Human name |
| `tier` * | T0–T6 (skill level where informative) |
| `category` * | MAT, KSF, DEV, SPC, STR, ACT, DYN, DEC, TIM, END, PREP, EVAL |
| `description` * | One line: what it captures |
| `computation` * | Algorithm, concrete enough to implement |
| `inputs` * | BOARD / MOVE / GAME / CORPUS / CLOCK / REF / EVAL |
| `engine` * | none \| cached-eval-optional |
| `output` | scalar / per-side / rate / distribution / vector; units |
| `aggregation` | how it rolls up: mean, variance, quantiles, rate, slope |
| `normalization` | per-phase, per-move-count, opening-residualized, opponent-Elo, time-control |
| `saturation` * | approx Elo where it stops discriminating |
| `confounders` | what biases it; failure modes |
| `reliability` | games/positions needed to stabilize; bootstrap CI note |
| `depends_on` | upstream features it builds on |
| `status` | implemented / planned / research |
| `golden` | reference position + expected value (parity test) |
| `viz` | best visualization (heatmap, trend, scatter, radar) |

Legend for the catalog tables — Inputs: P=position, M=move, G=game, C=corpus,
K=clock, R=reference DB, E=cached eval. All features are engine-free unless `E`.
Saturation ≈ Elo above which the feature is near-constant.

---

## 4. The catalog

### T0 — Existential basics (≲800): "don't lose material, don't get mated"

| id | feature | captures | computation | inp | sat |
|----|---------|----------|-------------|-----|-----|
| MAT.balance | Material balance | who has more wood | Σ piece values per side (P1 N3 B3 R5 Q9) | P | — |
| MAT.hanging | Hanging material (en prise) | undefended/under-defended attacked pieces | per piece: attacked AND (undefended OR cheapest attacker < piece value); count + Σ value | P | ~2000 |
| MAT.swing | Per-move material swing | blunder/sac magnitude | Δ of own en-prise value across the move (also Δ actual material) | M | ~2200 |
| KSF.in_check | King in check / mate proximity | immediate king danger | `is_check`; # legal replies (mate = 0) | P | ~1000 |
| TAC.exposure | One-move tactical exposure | walking into forcing shots | # opponent forcing replies after the move (checks + captures that win material) | M | ~2200 |

### T1 — Elementary principles (800–1200): development, center, king

| id | feature | captures | computation | inp | sat |
|----|---------|----------|-------------|-----|-----|
| DEV.count | Development by ply N | getting pieces out | minors/majors off home squares at ply ~16–20 | P | ~1600 |
| DEV.tempo_waste | Tempo waste | moving developed pieces / early queen | count re-moves of an already-developed piece before development done; queen leaves home before ≥3 minors out | M/G | ~1700 |
| KSF.castle | Castling timing & completion | king to safety | ply of castling; castled flag (king on g/c file) | P/G | ~1700 |
| SPC.center_occ | Center occupation | pawns/pieces in the centre | own pawns/pieces on d4/e4/d5/e5 + extended ring | P | ~1500 |
| ACT.control | Total board control | sheer activity | # of 64 squares attacked by ≥1 own piece | P | ~1800 |

### T2 — Club fundamentals (1200–1600): space, structure, files, conversion

| id | feature | captures | computation | inp | sat |
|----|---------|----------|-------------|-----|-----|
| SPC.space | Space | territory held | controlled squares in opponent's half (W: rank≥5, B: rank≤4) | P | ~2200 |
| STR.islands | Pawn islands | structural fragmentation | # connected pawn groups by file adjacency | P | ~2200 |
| STR.weak_pawns | Isolated/doubled/backward | static pawn weaknesses | isolated: no friendly pawn on adjacent files; doubled: ≥2 same file; backward: unsupported, advance square controlled by enemy pawn | P | ~2300 |
| STR.passed | Passed pawns | winning endgame resource | no enemy pawn on same/adjacent files ahead; weight by advancement | P | ~2400 |
| ACT.rook_files | Rooks on open/7th | rook technique | rooks on files with no (own) pawns; rook on 7th/8th | P | ~2300 |
| KSF.shield_pressure | King shield & zone pressure | concrete king safety | shield = own pawns on 3 files in front within 2 ranks; pressure = Σ enemy attackers on king + 8 neighbors | P | ~2400 |
| MAT.conversion | Conversion when ahead | "winning won games" | win rate of games that reached material ≥ +2 | G/C | ~2300 |
| TAC.density | Tactical density (complexity) | how sharp the position is | # available captures + checks; material tension count | P | ~2600* |

\* complexity itself never saturates; its *use* (T5 complexity-seeking) is the elite signal.

### T3 — Positional literacy (1600–2000): judgment begins

| id | feature | captures | computation | inp | sat |
|----|---------|----------|-------------|-----|-----|
| ACT.mobility | Per-piece mobility | piece activity, not just count | per piece: # pseudo-legal destinations (attack set minus own-occupied); symmetric both sides | P | ~2400 |
| ACT.outpost | Outposts / key squares | use of unassailable squares | square in enemy half, pawn-defended, unreachable by any enemy pawn; count knight-on-outpost + duration | P | ~2500 |
| ACT.bishop_quality | Good/bad bishop | structural awareness | per bishop: mobility / (1 + own pawns on its colour complex) | P | ~2500 |
| ACT.coordination | Piece coordination | force harmony | mutual-defence graph (edge = A defends B); graph density / mean degree | P | ~2400 |
| STR.tension_hold | Pawn-tension handling | maturity: don't release reflexively | mean lifetime of available pawn captures a side declines to resolve on its move | M/G | ~2500 |
| DEC.prophylaxis | Prophylaxis (basic) | restricting the opponent | for quiet moves (no capture/check/threat): Δ opponent total legal-move count; frequency of mobility-suppressing moves | M/G | ~2600 |
| DYN.initiative | Initiative / forcing ratio | dictating vs reacting | fraction of own moves that are checks, captures, or create a new threat | M/G | ~2400 |
| DEC.trade_discipline | Trade discipline | trading correctly | tag captures by material state + whether the traded piece guarded own king; ratio of trades toward vs away from safety | M/G | ~2300 |
| STR.colour_complex | Colour-complex control | light/dark strategy | square control split by colour complex; correlate with which bishop is kept | P | ~2500 |

### T4 — Mastery / judgment (2000–2400): imbalances, plans, transformation

| id | feature | captures | computation | inp | sat |
|----|---------|----------|-------------|-----|-----|
| DYN.imbalance | Imbalance appetite | exchange sacs, opp-bishops, material imbalance | detect non-standard balances entered *voluntarily* (R vs B+N, opp-coloured B); frequency + score | G/C | ~2700 |
| DEC.dynamic_static | Dynamic vs static bias | activity over structure | rate of moves that worsen own pawn structure to gain tempo/activity/open lines | M/G | ~2600 |
| ACT.regroup | Manoeuvring / regrouping | repositioning to better squares | track a piece's squares; flag relocations to higher-mobility/outpost squares over ≤K plies (knight reroutes etc.) | M/G | ~2600 |
| STR.transform | Pawn-structure transformation | executing breaks/minority attacks | detect voluntary skeleton changes (pawn breaks, minority-attack pawn trades) and structure-type transitions | M/G | ~2600 |
| TIM.complexity_slope | Time–complexity slope | calculate vs intuit | regress log(move time) on branching + tension + tactical density, per player; slope = feature | M/K | ~2700 |
| TIM.phase_alloc | Time allocation by phase | clock strategy | share of clock spent in opening/middlegame/endgame; variance | K/G | ~2700 |
| PREP.depth | Repertoire depth | how far prep runs | first ply where the move drops below a frequency threshold vs reference DB | M/R | ~2700 |
| DEC.plan_coherence | Plan coherence (research) | moves pulling one direction | per-move influence centroid; directional consistency (low variance of change vector) over a window | M/G | ~2700 |

### T5 — Elite differentiation (2400–2700): risk, conversion, defence, practicality

| id | feature | captures | computation | inp | sat |
|----|---------|----------|-------------|-----|-----|
| DEC.complexity_seek | Complexity-seeking index | risk appetite / sharp vs technical | mean over moves of (complexity after chosen move − mean complexity over all legal alternatives); + = steers into complications. Fully engine-free, one of the cleanest elite separators | M | rises to top |
| EVAL.squeeze | Squeeze index | winning dead-equal positions | sample positions with cached \|eval\|<~0.3 in mid/endgame; win rate of games passing through them | C/E | rises |
| EVAL.defence | Defensive resourcefulness | saving worse positions | of games reaching material ≤ −2 (or cached eval ≤ −1.5), draw+win rate | C/E | rises |
| TIM.pressure_quality | Quality under time pressure | composure | error proxy (cached-eval drop) in time trouble (<10% clock) vs not | K/E | rises |
| DEC.practical | Practical move selection | maximising opponent error | rate of chosen moves that are not engine-top yet keep higher post-move complexity for the opponent (eval near-equal, complexity higher) | M/E | rises |
| END.technique | Endgame technique | converting/holding endings | conversion rate of small edges in endgames; precision in technical rook/minor endings (cached-eval drop near 0) | G/E | rises |
| END.king_active | King activity in endgame | endgame king use | king centralization vs opponent in ≤6-non-pawn-piece positions | P | ~2600 |
| DEC.restriction | Prophylactic restriction at scale | sustained option-denial | `DEC.prophylaxis` integrated over spans; sustained reduction of opponent mobility/plan options across a phase | G | rises |

### T6 — The 2700+ frontier: consistency, prep, practical mastery

| id | feature | captures | computation | inp | sat |
|----|---------|----------|-------------|-----|-----|
| EVAL.error_floor | Error floor & consistency | the headline 2700 gap | mean AND variance of per-move cached-eval loss; tail behaviour at moves 30–60; "blunder-free game" rate | G/C/E | — |
| EVAL.critical_acc | Critical-moment accuracy | rising to the key moments | accuracy at high-complexity / high-eval-swing positions vs quiet ones (paired comparison) | M/E | — |
| PREP.novelty | Novelty timing & surprise | prep as a weapon | rate of low-frequency-but-sound continuations vs reference DB; first-divergence distribution; opening entropy by colour | C/R | — |
| PREP.adapt | Opponent-specific adaptation | tailoring to the opponent | shift in repertoire / feature profile conditioned on opponent identity or style cluster | C | — |
| TIM.energy | Clock/energy management | long-game stamina | clock-trajectory shape over the full game; self-inflicted time-scramble rate; consistency of late-game move time | K/G | — |
| DEC.create_imbalance | Imbalance from symmetry | winning from nothing | composite: high `complexity_seek` + high `squeeze` + low draw rate as *both* colours | M/C/E | — |
| DEC.risk_calibration | Risk calibration to state | situational risk control | correlation of sharpness (complexity_seek) with game/tournament context (colour, score, must-win) | M/C | — |

---

## 5. Second-order constructs (where the 2700 signal actually lives)

Once base features saturate, the discriminating information is in transforms of them.
These are first-class registry citizens, derived from any base feature `X`:

- **Consistency** — `var(X)` / IQR across a player's games. Low variance late in games
  is much of the 2500→2700 story.
- **Conditional** — `X | context` (e.g. `bishop_quality | IQP structure`,
  `accuracy | time_trouble`). Strong players' edges are situation-specific.
- **Trajectory** — slope of `X` over a career, or within a game by phase.
- **Interaction** — products like `complexity_seek × squeeze` (creates winning chances
  *and* converts them).
- **Residualized** — `X` after regressing out opening/structure and opponent Elo, so it
  measures the player not their book or their field.

## 6. Aggregation & normalization methodology — [STUB, flesh out]

Define per feature: roll-up statistic(s); phase segmentation; per-move-count
normalization; opening/structure residualization; opponent-Elo and time-control
controls; distribution vs point estimates; bootstrap CIs and minimum sample sizes.
(See `CLAUDE.md` §10 methodology notes as the seed.)

## 7. Data & engine-dependency policy — [STUB]

Map each `inputs`/`engine` tag to a concrete source and budget: BOARD (free), CLOCK
(online corpora only), REF (Lichess explorer/masters API), EVAL (Lichess cached
cloud-eval, rate-limited, sampled — never local Stockfish). Document the cached-eval
sampling strategy and the hard wall keeping EVAL out of the core path.

## 8. Validation & golden-test protocol — [STUB]

Every feature ships with: a Python reference, a JS mirror, and ≥1 golden
position→value (parity invariant, per `CLAUDE.md` §6). EVAL features additionally need
a fixture of cached evals so tests are deterministic offline.

## 9. Registry conventions & versioning — [STUB]

Namespaced ids; semantic versioning of definitions (a changed computation = new
version, not a silent edit); a `status` lifecycle (research → planned → implemented);
deprecation policy; and a machine-readable manifest (`features.yaml`) generated from
this doc so the pipeline and UI consume one source of truth.

---

## Appendix A — quick saturation map

```
BOARD-only  ───────────────────────────────────────►  EVAL/CLOCK/REF-assisted
T0 ── T1 ── T2 ──── T3 ────── T4 ──────── T5 ────────── T6
material   develop  space     judgment    plans/prep    risk/convert/   consistency/
hanging    centre   structure outposts    imbalance     defend/practical prep/energy
           king     files     prophylaxis time-slope                     critical-acc
(basics saturate left-to-right; their variance & conditionals re-enter as T6 constructs)
```
