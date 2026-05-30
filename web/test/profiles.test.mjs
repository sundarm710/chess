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
// EVAL absent everywhere (no %eval, no cloud-eval yet).
check(cand.leaderboards['EVAL.acpl'].available === false, 'EVAL unavailable (no eval data)');

console.log(
  process.exitCode
    ? `\nprofiles tests: failures above (${passed} ok).`
    : `profiles OK — ${passed} checks across 2 tournaments`,
);
