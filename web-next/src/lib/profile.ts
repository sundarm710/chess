// Pure, typed view-logic — the same slice/rank/goodness math as the vanilla app,
// but type-checked and unit-testable in isolation (no DOM).

import type { Higher, PlayerDoc, Profile, Slice } from '../types';

export const PHASES = ['opening', 'middlegame', 'endgame'] as const;
export const PHASE_LABEL: Record<string, string> = {
  opening: 'Opening',
  middlegame: 'Middlegame',
  endgame: 'Endgame',
};

// Stable category order so feature columns group sensibly.
const CAT_ORDER = ['MAT', 'SPC', 'KSF', 'STR', 'DEV', 'ACT', 'DYN', 'TAC', 'DEC', 'TIM', 'EVAL'];

export interface SliceSel {
  phase: 'all' | (typeof PHASES)[number];
  color: 'all' | 'w' | 'b';
}

const EMPTY: Slice = { mean: NaN, n: 0 };

/** One player's value for a feature under a {phase,color} slice; falls back to the
 *  phase marginal when a phase×colour cross cell isn't stored (flagged `approx`). */
export function sliceValue(d: PlayerDoc | undefined, fid: string, sel: SliceSel): Slice {
  const r = d?.rollups?.[fid];
  if (!r) return EMPTY;
  const { phase, color } = sel;
  if (phase === 'all') {
    if (color === 'all') return { mean: r.mean ?? NaN, n: r.n };
    return color === 'w'
      ? { mean: r.mean_white ?? NaN, n: r.n_white }
      : { mean: r.mean_black ?? NaN, n: r.n_black };
  }
  // phase is now narrowed to a concrete Phase
  if (color === 'all') return r.phases?.[phase] ?? EMPTY;
  const cell = r.cross?.[`${phase}:${color}`];
  if (cell) return cell;
  const m = r.phases?.[phase];
  return m ? { mean: m.mean, n: m.n, approx: true } : EMPTY;
}

export const isOk = (s: Slice) => Number.isFinite(s.mean);

/** Available features (capability-gated), grouped by category in a stable order. */
export function availableFeatures(p: Profile): string[] {
  const ids = Object.keys(p.leaderboards).filter((id) => p.leaderboards[id].available);
  return ids.sort((a, b) => {
    const ca = CAT_ORDER.indexOf(p.meta[a]?.category ?? '');
    const cb = CAT_ORDER.indexOf(p.meta[b]?.category ?? '');
    return ca - cb || a.localeCompare(b);
  });
}

export const playersByScore = (p: Profile): [string, PlayerDoc][] =>
  Object.entries(p.players).sort((a, b) => b[1].score - a[1].score);

/** 0..1 "goodness" of a value within a field range, inverting `bad` features. */
export function goodness(v: number, lo: number, hi: number, higher: Higher): number | null {
  if (!Number.isFinite(v) || higher === 'neutral' || hi === lo) return null;
  const t = (v - lo) / (hi - lo);
  return higher === 'bad' ? 1 - t : t;
}

/** Per-feature {lo,hi} over qualified players, for colour scaling. */
export function columnRange(
  p: Profile,
  fid: string,
  sel: SliceSel,
  nMin: number,
): { lo: number; hi: number } {
  const vals = Object.values(p.players)
    .map((d) => sliceValue(d, fid, sel))
    .filter((s) => isOk(s) && s.n >= nMin)
    .map((s) => s.mean);
  return { lo: Math.min(...vals), hi: Math.max(...vals) };
}

export function cellColor(g: number): string {
  const hue = g * 120; // red→green
  return `hsl(${hue}, 55%, ${91 - Math.abs(g - 0.5) * 14}%)`;
}
