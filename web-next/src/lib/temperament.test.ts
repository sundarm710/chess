import { describe, expect, it } from 'vitest';
import type { FeatureMeta } from '../types';
import type { FormGame } from './form';
import { buildTemperament, tempColor, zscores } from './temperament';

const game = (round: number, vals: Record<string, number>): FormGame => ({
  round,
  value: null,
  score: 0.5,
  outcome: 'D',
  opp: 'X',
  color: 'w',
  oppElo: null,
  ownElo: null,
  cum: 0,
  entering: 'start',
  ...({ vals } as object),
}) as FormGame & { vals: Record<string, number> };

const meta = (higher: FeatureMeta['higher']): FeatureMeta => ({
  name: 'F',
  category: 'X',
  higher,
  requires: [],
  description: '',
});

describe('zscores', () => {
  it('centers on the mean and is unit-variance-ish', () => {
    const z = zscores([1, 2, 3]);
    expect(z[1]).toBeCloseTo(0); // middle value is the mean
    expect((z[0] as number)).toBeLessThan(0);
    expect((z[2] as number)).toBeGreaterThan(0);
  });

  it('returns ~0 (not NaN/∞) for a constant series via the std floor', () => {
    const z = zscores([5, 5, 5]);
    expect(z.every((v) => v != null && Math.abs(v as number) < 1e-6)).toBe(true);
  });

  it('preserves nulls and ignores them in the mean', () => {
    const z = zscores([10, null, 20]);
    expect(z[1]).toBeNull();
    expect((z[0] as number)).toBeLessThan(0);
  });
});

describe('buildTemperament', () => {
  const games = [game(1, { 'STR.islands': 1, 'STR.passed': 0 }), game(2, { 'STR.islands': 3, 'STR.passed': 2 })];
  const valueOf = (g: FormGame, fid: string) => (g as unknown as { vals: Record<string, number> }).vals[fid] ?? null;
  const available = new Set(['STR.islands', 'STR.passed']);
  const metas: Record<string, FeatureMeta> = { 'STR.islands': meta('bad'), 'STR.passed': meta('good') };

  const rows = buildTemperament(games, valueOf, available, metas);
  const structure = rows.find((r) => r.key === 'structure')!;

  it('only emits clusters that have available members', () => {
    // none of the aggression/composure members are available here
    expect(rows.map((r) => r.key)).toEqual(['structure']);
    expect(structure.members.sort()).toEqual(['STR.islands', 'STR.passed']);
  });

  it('sign-aligns members so "more islands" reads as LOWER discipline', () => {
    // islands rose R1->R2, but its sign is -1, so its aligned z must go negative.
    const islands = structure.features.find((f) => f.fid === 'STR.islands')!;
    expect((islands.cells[0].z as number)).toBeGreaterThan(0); // fewer islands -> more disciplined
    expect((islands.cells[1].z as number)).toBeLessThan(0);
  });

  it('cluster cell is the mean of aligned member z', () => {
    const c = structure.cells[1];
    const members = structure.features.map((f) => f.cells[1].z as number);
    expect(c.z).toBeCloseTo(members.reduce((a, b) => a + b, 0) / members.length);
    expect(c.n).toBe(2);
  });
});

describe('tempColor', () => {
  it('is paper2 for null, warm for +z, cool for -z', () => {
    expect(tempColor(null)).toContain('paper2');
    expect(tempColor(1.6)).toBe('rgb(154, 59, 46)'); // full oxblood at +ZMAX
    expect(tempColor(-1.6)).toBe('rgb(31, 86, 115)'); // full deep-blue at -ZMAX
  });
});
