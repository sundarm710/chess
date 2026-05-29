// Validates the generated Candidates games library (web/data/candidates2026.json):
// shape, uniqueness, and that every game carries usable movetext. Regenerate with
//   engine/.venv/bin/python scripts/build_candidates.py
//
//   node web/test/library.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, '..', 'data', 'candidates2026.json'), 'utf8'));

let passed = 0;
function check(cond, msg) {
  if (cond) passed++;
  else { console.error(`FAIL ${msg}`); process.exitCode = 1; }
}

check(data.count === data.games.length, 'count matches games array length');
check(data.games.length === 112, `expected 112 games, got ${data.games.length}`);

const ids = new Set();
const tours = {};
for (const g of data.games) {
  for (const k of ['id', 'tour', 'round', 'board', 'white', 'black', 'result', 'pgn', 'label']) {
    if (!(k in g)) { check(false, `game ${g.id} missing field ${k}`); }
  }
  check(!ids.has(g.id), `duplicate id ${g.id}`);
  ids.add(g.id);
  check(typeof g.pgn === 'string' && g.pgn.length > 0, `game ${g.id} has empty pgn`);
  check(g.round >= 1 && g.round <= 14, `game ${g.id} round out of range`);
  tours[g.tour] = (tours[g.tour] || 0) + 1;
}
check(tours.open === 56 && tours.women === 56, `expected 56+56, got ${JSON.stringify(tours)}`);

if (process.exitCode) console.error('\nlibrary tests: failures above.');
else console.log(`library OK — ${passed} checks across ${data.games.length} games`);
