import { describe, expect, it } from 'vitest';
import type { GameRow, Profile } from '../types';
import { featureGroups, featureMetric, groupRanges, metricRange, playerNames, traitGroups } from './metrics';
import { pearson, traitTable } from './traits';

const roll = (mean: number) => ({ n: 3, mean });
const gr = (round: number, score: number, islands: number, passed: number): GameRow => ({
  id: `t__r0${round}b01`,
  round,
  color: 'w',
  opp: 'x',
  result: '*',
  score,
  vals: { 'STR.islands': islands, 'STR.passed': passed },
});
const player = (score: number, islands: number, passed: number, rows: GameRow[]) => ({
  games: rows.length, score, wins: 0, draws: 0, losses: 0, performance_elo: 2700, avg_opp_elo: null,
  rollups: { 'STR.islands': roll(islands), 'STR.passed': roll(passed) }, game_rows: rows,
});

const p = {
  slug: 't', label: 'T', has_clock: false, has_eval: false, n_min: 1, emit_cross: false,
  meta: {
    'STR.islands': { name: 'Pawn islands', category: 'STR', higher: 'bad', requires: [], description: 'd' },
    'STR.passed': { name: 'Passed pawns', category: 'STR', higher: 'good', requires: [], description: 'd' },
  },
  players: {
    A: player(2, 1, 3, [gr(1, 1, 1, 3), gr(2, 0.5, 1, 3)]),
    B: player(1, 3, 1, [gr(1, 0, 3, 1)]),
    C: player(0, 2, 2, [gr(1, 0.5, 2, 2)]),
  },
  leaderboards: {
    'STR.islands': { higher: 'bad', available: true, entries: [] },
    'STR.passed': { higher: 'good', available: true, entries: [] },
  },
  result_correlation: {}, feature_correlation: { features: [], r: [] },
} as unknown as Profile;

const sel = { phase: 'all', color: 'all' } as const;

describe('featureMetric', () => {
  const fm = featureMetric(p, sel, 'STR.islands');
  it('reads the player aggregate from the rollup', () => {
    expect(fm.player('A')).toEqual({ mean: 1, n: 3, approx: undefined });
    expect(fm.higher).toBe('bad');
  });
  it('reads a single game value', () => {
    expect(fm.game(p.players.A.game_rows[0])).toBe(1);
  });
});

describe('featureGroups / metricRange', () => {
  const groups = featureGroups(p, sel);
  it('groups by category', () => {
    expect(groups.map((g) => g.key)).toEqual(['STR']);
    expect(groups[0].members.map((m) => m.id).sort()).toEqual(['STR.islands', 'STR.passed']);
  });
  it('field range spans the player means', () => {
    const r = metricRange(groups[0].members.find((m) => m.id === 'STR.islands')!, playerNames(p), 1);
    expect(r).toEqual({ lo: 1, hi: 3 });
  });
});

describe('traitGroups', () => {
  const tbl = traitTable(p, sel);
  const groups = traitGroups(p, sel, tbl);
  const structure = groups.find((g) => g.key === 'structure')!;
  it('has a z-score lead column + raw member features', () => {
    expect(structure.lead?.id).toBe('trait:structure');
    expect(structure.lead?.aggregate).toBe(true);
    expect(structure.lead?.higher).toBe('good');
    expect(structure.lead?.player('A')?.mean).toBeCloseTo(1); // A cleanest structure
    expect(structure.members.map((m) => m.id).sort()).toEqual(['STR.islands', 'STR.passed']);
    expect(structure.members[0].aggregate).toBe(false); // members are raw features
  });
  it('groupRanges covers lead + members', () => {
    const ranges = groupRanges(groups, playerNames(p), 1);
    expect(ranges.has('trait:structure')).toBe(true);
    expect(ranges.has('STR.islands')).toBe(true);
  });
});

describe('pearson', () => {
  it('is +1 for a perfectly increasing pair set', () => {
    expect(pearson([[1, 2], [2, 4], [3, 6]])).toBeCloseTo(1);
  });
  it('is -1 for a perfectly decreasing pair set', () => {
    expect(pearson([[1, 6], [2, 4], [3, 2]])).toBeCloseTo(-1);
  });
  it('is null below 3 points', () => {
    expect(pearson([[1, 1], [2, 2]])).toBeNull();
  });
});
