import { describe, expect, it } from 'vitest';
import type { PlayerDoc } from '../types';
import { goodness, sliceValue } from './profile';

// A minimal player doc covering the slice cases.
const doc: PlayerDoc = {
  games: 14, score: 8, wins: 4, draws: 8, losses: 2,
  performance_elo: 2800, avg_opp_elo: 2750,
  rollups: {
    'SPC.space': {
      n: 14, mean: 8.46, stdev: 1.4, ci: 0.7,
      mean_white: 9.01, n_white: 7, mean_black: 7.9, n_black: 7, n_unavailable: 0,
      phases: { opening: { mean: 5.37, n: 14 }, middlegame: { mean: 9.62, n: 14 }, endgame: { mean: 9.09, n: 8 } },
      cross: { 'endgame:b': { mean: 8.57, n: 5 } },
    },
  },
};

describe('sliceValue', () => {
  it('returns the overall mean for all/all', () => {
    expect(sliceValue(doc, 'SPC.space', { phase: 'all', color: 'all' })).toEqual({ mean: 8.46, n: 14 });
  });
  it('returns the phase marginal', () => {
    expect(sliceValue(doc, 'SPC.space', { phase: 'endgame', color: 'all' })).toEqual({ mean: 9.09, n: 8 });
  });
  it('returns the colour marginal', () => {
    expect(sliceValue(doc, 'SPC.space', { phase: 'all', color: 'b' })).toEqual({ mean: 7.9, n: 7 });
  });
  it('uses the cross cell when present', () => {
    expect(sliceValue(doc, 'SPC.space', { phase: 'endgame', color: 'b' })).toEqual({ mean: 8.57, n: 5 });
  });
  it('falls back to the phase marginal (approx) when no cross cell', () => {
    expect(sliceValue(doc, 'SPC.space', { phase: 'opening', color: 'w' })).toEqual({ mean: 5.37, n: 14, approx: true });
  });
  it('is empty for an unknown feature', () => {
    const s = sliceValue(doc, 'NOPE', { phase: 'all', color: 'all' });
    expect(Number.isFinite(s.mean)).toBe(false);
    expect(s.n).toBe(0);
  });
});

describe('goodness', () => {
  it('maps within range and inverts bad features', () => {
    expect(goodness(10, 0, 10, 'good')).toBe(1);
    expect(goodness(10, 0, 10, 'bad')).toBe(0);
    expect(goodness(5, 0, 10, 'neutral')).toBeNull();
  });
});
