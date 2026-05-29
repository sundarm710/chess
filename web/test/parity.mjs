// JS-side golden + parity check (CLAUDE.md §6, §13).
//
// Loads web/test/golden.json — the SAME corpus the Python tests assert against,
// exported from engine/tests/golden_fens.py — and verifies the JS engine produces
// identical numbers. Run by the project test runner; exits non-zero on any mismatch.
//
//   node web/test/parity.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { featuresFromFen } from '../src/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const goldenPath = join(here, 'golden.json');

let golden;
try {
  golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
} catch (e) {
  console.error(`Could not read ${goldenPath}. Run the Python exporter first ` +
    `(it runs as part of ./run_tests.sh):\n  ${e.message}`);
  process.exit(2);
}

let failures = 0;
let checks = 0;

for (const [fen, expected] of Object.entries(golden)) {
  const pos = featuresFromFen(fen);
  for (const color of ['w', 'b']) {
    for (const [field, want] of Object.entries(expected[color])) {
      checks++;
      const got = pos[color][field];
      if (got !== want) {
        failures++;
        console.error(`FAIL ${fen}\n  [${color}].${field}: got ${got}, want ${want}`);
      }
    }
  }
  checks++;
  if (pos.tension !== expected.tension) {
    failures++;
    console.error(`FAIL ${fen}\n  tension: got ${pos.tension}, want ${expected.tension}`);
  }
}

if (failures) {
  console.error(`\n${failures} mismatch(es) across ${Object.keys(golden).length} positions.`);
  process.exit(1);
}
console.log(`parity OK — ${checks} assertions across ${Object.keys(golden).length} golden positions`);
