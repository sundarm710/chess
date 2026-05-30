// Module-graph resolution test. `node --check` only validates per-file syntax; it
// does NOT catch a bad cross-module import (e.g. importing a name a module doesn't
// export) — that only fails at load time in the browser. This test imports every
// browser module and asserts its public exports, catching such breaks in CI.
//
// app.js is excluded: it calls boot() (touching document/window) at import time.
// Every module app.js imports IS covered here, so a missing export it relies on
// still surfaces.
//
//   node web/test/modules.test.mjs

import assert from 'node:assert/strict';

const EXPECTED = {
  'engine.js': ['Board', 'FeatureEngine', 'Piece', 'features', 'featuresFromFen', 'sideFeats', 'PIECE_VALUES', 'opposite'],
  'parser.js': ['PgnParser', 'extractSans'],
  'pieces.js': ['PIECE_SVG'],
  'catalog.js': ['BOARD_CATALOG', 'CATALOG_BY_ID', 'HIGHER', 'catalogManifest', 'CATEGORY_LABEL'],
  'highlights.js': ['highlightsFor', 'hangingSquares', 'kingZoneSquares', 'shieldSquares'],
  'analysis.js': ['buildAnalysis', 'indexPly'],
  'api.js': ['analyzeGame', 'fetchManifest'],
  'explain.js': ['renderFeatureList', 'renderExplain'],
  'profiles.js': ['loadProfiles'],
};

let passed = 0;
for (const [file, names] of Object.entries(EXPECTED)) {
  let mod;
  try {
    mod = await import(new URL(`../src/${file}`, import.meta.url));
  } catch (e) {
    console.error(`FAIL ${file} failed to load:\n  ${e.message}`);
    process.exitCode = 1;
    continue;
  }
  for (const name of names) {
    if (name in mod) {
      passed++;
    } else {
      console.error(`FAIL ${file} missing export: ${name}`);
      process.exitCode = 1;
    }
  }
}

if (process.exitCode) console.error('\nmodule resolution: failures above.');
else console.log(`module resolution OK — ${passed} exports across ${Object.keys(EXPECTED).length} modules`);
