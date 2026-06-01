// Validates the generated tournament profiles (web/data/profiles/<slug>.json):
// shape, server-side sort direction, capability gating, and min-n behaviour.
// Regenerate with: engine/.venv/bin/python scripts/build_profiles.py
//
//   node web/test/profiles.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'profiles');
const load = (slug) => JSON.parse(readFileSync(join(dir, `${slug}.json`), 'utf8'));

let passed = 0;
const check = (cond, msg) => { if (cond) passed++; else { console.error(`FAIL ${msg}`); process.exitCode = 1; } };

const cand = load('candidates-2026-open');
const gsw = load('grand-swiss-2025');

// Shape
for (const k of ['slug', 'label', 'has_clock', 'meta', 'players', 'leaderboards', 'n_min']) {
  check(k in cand, `candidates profile missing ${k}`);
}
check(Object.keys(cand.players).length >= 8, 'candidates has players');
check(cand.meta['SPC.space'] && cand.meta['SPC.space'].name, 'meta carries feature names');

// Server-side sort: a 'good' feature is descending among qualified entries.
const space = cand.leaderboards['SPC.space'];
check(space.available && space.higher === 'good', 'space available & higher=good');
const qual = space.entries.filter((e) => e[2] >= cand.n_min).map((e) => e[1]);
check(qual.every((v, i) => i === 0 || qual[i - 1] >= v), 'good leaderboard sorted descending');

// A 'bad' feature is ascending (lower is better ranks first).
const hang = cand.leaderboards['MAT.hanging'];
if (hang && hang.available) {
  const hv = hang.entries.filter((e) => e[2] >= cand.n_min).map((e) => e[1]);
  check(hv.every((v, i) => i === 0 || hv[i - 1] <= v), 'bad leaderboard sorted ascending');
}

// Min-n: sub-threshold entries never precede qualified ones.
for (const board of Object.values(cand.leaderboards)) {
  if (!board.available) continue;
  let seenLow = false;
  for (const [, , n] of board.entries) {
    if (n < cand.n_min) seenLow = true;
    else check(!seenLow, 'a qualified entry followed a sub-min-n entry');
  }
}

// Capability gating: clocks present for Candidates, absent for Grand Swiss.
check(cand.leaderboards['TIM.clock'].available === true, 'candidates TIM.clock available');
check(gsw.leaderboards['TIM.clock'].available === false, 'grand-swiss TIM.clock unavailable');
// EVAL: present for the Candidates (annotated by annotate_eval.py), absent for Grand Swiss.
check(cand.leaderboards['EVAL.acpl'].available === true, 'candidates EVAL.acpl available (annotated)');
check(gsw.leaderboards['EVAL.acpl'].available === false, 'grand-swiss EVAL.acpl unavailable (not annotated)');
check(cand.has_eval === true && gsw.has_eval === false, 'has_eval flag set per annotation');

// --- Phase & colour slices ---------------------------------------------------
const PHASES = ['opening', 'middlegame', 'endgame'];
// A populated player carries phase marginals; each phase n <= the overall n.
let sawPhases = false;
for (const p of Object.values(cand.players)) {
  const r = p.rollups['SPC.space'];
  if (!r || r.mean == null) continue;
  check('phases' in r, 'populated rollup carries phases');
  for (const ph of Object.keys(r.phases || {})) {
    check(PHASES.includes(ph), `phase key ${ph} valid`);
    check(r.phases[ph].n <= r.n, `phase ${ph} n <= overall n`);
    check(Number.isFinite(r.phases[ph].mean), `phase ${ph} mean finite`);
    sawPhases = true;
  }
  // Colour marginal n splits the total (per-side or shared feature).
  check(r.n_white + r.n_black === r.n, 'n_white + n_black === n');
}
check(sawPhases, 'at least one populated phase slice seen');

// Cross + per-game phase breakdown are always emitted now (gate removed).
check(cand.emit_cross === true && gsw.emit_cross === true, 'emit_cross true everywhere');
const withCross = Object.values(cand.players).find((p) => p.rollups['SPC.space']?.cross);
check(!!withCross, 'candidates has a cross slice');
const withPhaseRows = Object.values(cand.players).find((p) => p.game_rows.some((r) => r.phase_vals));
check(!!withPhaseRows, 'candidates game_rows carry phase_vals');

// Feature↔feature correlation matrix: square, symmetric, diagonal 1, entries in [-1,1] or null.
for (const prof of [cand, gsw]) {
  const fc = prof.feature_correlation;
  check(fc && Array.isArray(fc.features) && fc.features.length > 0, `${prof.slug} feature_correlation present`);
  const k = fc.features.length;
  check(fc.r.length === k && fc.r.every((row) => row.length === k), `${prof.slug} matrix is square`);
  check(fc.r.every((row, i) => row[i] === 1.0), `${prof.slug} diagonal = 1`);
  check(fc.r.every((row, i) => row.every((v, j) => v === fc.r[j][i])), `${prof.slug} symmetric`);
  check(fc.r.every((row) => row.every((v) => v === null || (v >= -1 && v <= 1))), `${prof.slug} entries in [-1,1]`);
}

// Result correlation: present, bounded in [-1,1], with valid (optional) per-phase entries.
check(cand.result_correlation && Object.keys(cand.result_correlation).length > 0, 'result_correlation present');
for (const [fid, rc] of Object.entries(cand.result_correlation)) {
  check(rc.r >= -1 && rc.r <= 1, `${fid} r in [-1,1]`);
  check(rc.n >= 10, `${fid} correlation n >= CORR_MIN_N`);
  for (const ph of Object.keys(rc.phases || {})) {
    check(PHASES.includes(ph) && rc.phases[ph].r >= -1 && rc.phases[ph].r <= 1, `${fid} phase ${ph} r valid`);
  }
}

// The default (all/all) leaderboards are still pre-sorted as the SPA expects (regression lock).
check(qual.every((v, i) => i === 0 || qual[i - 1] >= v), 'default leaderboard sort intact');

console.log(
  process.exitCode
    ? `\nprofiles tests: failures above (${passed} ok).`
    : `profiles OK — ${passed} checks (phase/colour/correlation) across 2 tournaments`,
);
