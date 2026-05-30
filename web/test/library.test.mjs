// Validates the generated games library: the index (web/data/library.json) and each
// per-tournament file (web/data/t/<slug>.json). Regenerate with
//   engine/.venv/bin/python scripts/build_library.py
//
//   node web/test/library.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const index = JSON.parse(readFileSync(join(dataDir, 'library.json'), 'utf8')).tournaments;

let passed = 0;
function check(cond, msg) {
  if (cond) passed++;
  else { console.error(`FAIL ${msg}`); process.exitCode = 1; }
}

check(Array.isArray(index) && index.length >= 1, 'index has tournaments');
const allIds = new Set();
let totalGames = 0;

for (const t of index) {
  for (const k of ['slug', 'label', 'tournament', 'year', 'section', 'rounds', 'count']) {
    check(k in t, `index entry ${t.slug} missing ${k}`);
  }
  const doc = JSON.parse(readFileSync(join(dataDir, 't', `${t.slug}.json`), 'utf8'));
  check(doc.games.length === t.count, `${t.slug}: count ${t.count} != games ${doc.games.length}`);
  totalGames += doc.games.length;
  for (const g of doc.games) {
    for (const k of ['id', 'round', 'board', 'white', 'black', 'result', 'label', 'pgn']) {
      if (!(k in g)) check(false, `${t.slug} game missing ${k}`);
    }
    check(g.id.startsWith(t.slug + '__'), `${g.id} not prefixed by slug ${t.slug}`);
    check(!allIds.has(g.id), `duplicate id ${g.id}`);
    allIds.add(g.id);
    check(typeof g.pgn === 'string' && g.pgn.length > 0, `${g.id} empty pgn`);
  }
}

check(totalGames === index.reduce((s, t) => s + t.count, 0), 'index counts sum to games');
console.log(
  process.exitCode
    ? `\nlibrary tests: failures above (${passed} ok).`
    : `library OK — ${passed} checks · ${index.length} tournaments · ${totalGames} games`,
);
