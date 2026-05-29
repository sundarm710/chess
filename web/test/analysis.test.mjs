// Tests for the offline analysis builder (analysis.js) — it must produce the same
// contract shape the backend serves, with correct values, deltas, and grouping.
//
//   node web/test/analysis.test.mjs

import assert from 'node:assert/strict';

import { Board, FeatureEngine } from '../src/engine.js';
import { buildAnalysis, indexPly } from '../src/analysis.js';
import { highlightsFor } from '../src/highlights.js';

const engine = new FeatureEngine();
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

function analysisFor(fens, moves) {
  const boards = fens.map((f) => Board.fromFen(f));
  const feats = boards.map((b) => engine.features(b));
  return buildAnalysis({ fens, boards, feats, moves });
}

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (e) { console.error(`FAIL ${name}\n  ${e.message}`); process.exitCode = 1; }
}

test('single position: 19 feature rows, correct start values, null deltas', () => {
  const a = analysisFor([START], []);
  assert.equal(a.plies.length, 1);
  const byId = indexPly(a.plies[0]);
  assert.equal(a.plies[0].features.length, 43); // 21 per-side ×2 + 1 shared
  assert.equal(byId['MAT.balance'].w.value, 39);
  assert.equal(byId['ACT.control'].w.value, 22);
  assert.equal(byId['STR.tension'].shared.value, 0);
  assert.equal(byId['MAT.balance'].w.delta, null);
});

test('contract shape: meta + plies + feature fields', () => {
  const a = analysisFor([START], []);
  assert.ok(a.meta['MAT.balance'].name === 'Material');
  const f = a.plies[0].features[0];
  for (const k of ['id', 'side', 'value', 'delta', 'status', 'evidence']) assert.ok(k in f, `missing ${k}`);
  assert.ok('squares' in f.evidence && 'layman' in f.evidence && 'technical' in f.evidence);
});

test('delta computed across plies (control +7 after 1.e4)', () => {
  const a = analysisFor([START, AFTER_E4], [{ san: 'e4', mover: 'w', from: 'e2', to: 'e4', uci: 'e2e4' }]);
  const byId = indexPly(a.plies[1]);
  assert.equal(byId['ACT.control'].w.value, 29);
  assert.equal(byId['ACT.control'].w.delta, 7);
  assert.equal(a.plies[1].san, 'e4');
});

test('hanging evidence carries the en-prise square', () => {
  // Club position: Black queen on d8 hanging (CLAUDE.md §6 parity FEN).
  const fen = 'r2qk2r/ppp2pp1/2np3p/2b1p2n/2B1P1bB/3P1N2/PPPN1PPP/R2Q1RK1 w kq - 4 9';
  const a = analysisFor([fen], []);
  const byId = indexPly(a.plies[0]);
  assert.equal(byId['MAT.hanging'].b.value, 9);
  assert.ok(byId['MAT.hanging'].b.evidence.squares.includes('d8'));
});

test('highlightsFor returns center squares for SPC.center_control', () => {
  const board = Board.fromFen(START);
  const hl = highlightsFor(board, 'SPC.center_control');
  assert.deepEqual(hl.squares.sort(), ['d4', 'd5', 'e4', 'e5']);
  assert.equal(hl.kind, 'neutral');
});

if (process.exitCode) console.error(`\nanalysis tests: ${passed} passed, with failures.`);
else console.log(`analysis tests OK — ${passed} assertions`);
