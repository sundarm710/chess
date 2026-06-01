import { describe, expect, it } from 'vitest';
import type { GameRow } from '../types';
import { byStreak, formTimeline } from './form';

const row = (round: number, score: number, v: number): GameRow => ({
  id: `t__r${String(round).padStart(2, '0')}b01`,
  round,
  color: 'w',
  opp: 'X',
  result: '*',
  score,
  vals: { F: v },
});

describe('formTimeline streak conditioning', () => {
  // results: L, L, W, D  → entering states should be start, afterL, after2L, afterW
  const rows = [row(1, 0, 10), row(2, 0, 20), row(3, 1, 30), row(4, 0.5, 40)];
  const games = formTimeline(rows, 'F', new Map());

  it('labels the entering streak from prior results', () => {
    expect(games.map((g) => g.entering)).toEqual(['start', 'afterL', 'after2L', 'afterW']);
  });

  it('accumulates score', () => {
    expect(games.map((g) => g.cum)).toEqual([0, 0, 1, 1.5]);
  });

  it('groups means by streak', () => {
    const s = byStreak(games);
    expect(s.find((x) => x.key === 'after2L')?.mean).toBe(30); // the W after two losses
    expect(s.find((x) => x.key === 'afterL')?.mean).toBe(20);
  });
});
