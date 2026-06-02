import { describe, expect, it } from 'vitest';
import type { Profile } from '../types';
import { availableTraits, fieldFeatStats, gameTraitZ, traitTable } from './traits';

// Minimal field: 3 players, two STRUCTURE-trait features (islands bad/-1, passed good/+1).
const roll = (mean: number) => ({ n: 3, mean });
const player = (score: number, islands: number, passed: number) => ({
  games: 3,
  score,
  wins: 0,
  draws: 0,
  losses: 0,
  performance_elo: null,
  avg_opp_elo: null,
  rollups: { 'STR.islands': roll(islands), 'STR.passed': roll(passed) },
  game_rows: [],
});

const p = {
  slug: 't',
  label: 'T',
  has_clock: false,
  has_eval: false,
  n_min: 1,
  emit_cross: false,
  meta: {
    'STR.islands': { name: 'Pawn islands', category: 'STR', higher: 'bad', requires: [], description: '' },
    'STR.passed': { name: 'Passed pawns', category: 'STR', higher: 'good', requires: [], description: '' },
  },
  players: {
    A: player(2, 1, 3), // cleanest structure
    B: player(1, 3, 1), // worst
    C: player(0, 2, 2), // average
  },
  leaderboards: {
    'STR.islands': { higher: 'bad', available: true, entries: [] },
    'STR.passed': { higher: 'good', available: true, entries: [] },
  },
  result_correlation: {},
  feature_correlation: { features: [], r: [] },
} as unknown as Profile;

const sel = { phase: 'all', color: 'all' } as const;

describe('availableTraits', () => {
  it('keeps only traits with populated members', () => {
    const t = availableTraits(p);
    expect(t.map((x) => x.key)).toEqual(['structure']);
    expect(t[0].members.map((m) => m.fid).sort()).toEqual(['STR.islands', 'STR.passed']);
  });
});

describe('fieldFeatStats', () => {
  it('is the mean/std of player means', () => {
    const s = fieldFeatStats(p, ['STR.islands', 'STR.passed'], sel);
    expect(s['STR.islands'].mean).toBe(2);
    expect(s['STR.islands'].std).toBeCloseTo(1); // sample std of [1,3,2]
  });
});

describe('traitTable', () => {
  const t = traitTable(p, sel);

  it('rows are in score order (playersByScore)', () => {
    expect(t.rows.map((r) => r.name)).toEqual(['A', 'B', 'C']);
  });

  it('sign-aligns so fewer islands + more passers = HIGHER structure discipline', () => {
    const z = Object.fromEntries(t.rows.map((r) => [r.name, r.traits.structure.z]));
    expect(z.A).toBeCloseTo(1); // both features a full SD better than the field
    expect(z.B).toBeCloseTo(-1);
    expect(z.C).toBeCloseTo(0);
    expect((z.A as number) > (z.C as number) && (z.C as number) > (z.B as number)).toBe(true);
  });
});

describe('gameTraitZ', () => {
  it('scores one game on the same field normaliser', () => {
    const { traits, stats } = traitTable(p, sel);
    const cell = gameTraitZ({ 'STR.islands': 0, 'STR.passed': 4 }, traits[0], stats);
    expect(cell.z).toBeCloseTo(2); // 2 SD cleaner on both
    expect(cell.n).toBe(2);
  });
});
