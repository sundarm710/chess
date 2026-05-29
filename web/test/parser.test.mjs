// Unit tests for the PGN tokenizer (CLAUDE.md §7). Covers extractSans — the pure
// string logic where all the hard-won gotchas live — without needing chess.js, so
// it runs in plain node. Move application is exercised by the app + parity corpus.
//
//   node web/test/parser.test.mjs

import assert from 'node:assert/strict';

import { extractSans, PgnParser } from '../src/parser.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
}

test('strips headers and result, keeps SAN', () => {
  const sans = extractSans('[Event "X"]\n[Site "Y"]\n1.e4 e5 2.Nf3 Nc6 1-0');
  assert.deepEqual(sans, ['e4', 'e5', 'Nf3', 'Nc6']);
});

test('drops {comments}, ;comments, (variations), $NAGs', () => {
  const sans = extractSans('1.e4 {best by test} e5 ;rest of line\n2.Nf3 (2.Bc4 Bc5) Nc6 $1 $2');
  assert.deepEqual(sans, ['e4', 'e5', 'Nf3', 'Nc6']);
});

test('strips trailing +, #, !, ? annotations', () => {
  const sans = extractSans('1.e4 e5 2.Qh5 Nc6?? 3.Bc4 Nf6?? 4.Qxf7#');
  assert.deepEqual(sans, ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7']);
});

test('normalizes 0-0 / 0-0-0 to O-O / O-O-O', () => {
  assert.deepEqual(extractSans('1.e4 e5 2.O-O 0-0'), ['e4', 'e5', 'O-O', 'O-O']);
  assert.deepEqual(extractSans('20.0-0-0 O-O-O'), ['O-O-O', 'O-O-O']);
});

test('handles a bare * result and numbered ellipses', () => {
  assert.deepEqual(extractSans('1.e4 e5 2.Nf3 *'), ['e4', 'e5', 'Nf3']);
  assert.deepEqual(extractSans('1.e4 e5 2... Nc6'), ['e4', 'e5', 'Nc6']);
});

test('empty / header-only movetext yields no tokens', () => {
  assert.deepEqual(extractSans('[Event "X"]\n\n*'), []);
  assert.deepEqual(extractSans(''), []);
});

test('PgnParser throws a clear error without chess.js', () => {
  assert.throws(() => new PgnParser(null), /chess\.js/);
});

if (process.exitCode) {
  console.error(`\nparser tests: ${passed} passed, with failures.`);
} else {
  console.log(`parser tests OK — ${passed} assertions`);
}
