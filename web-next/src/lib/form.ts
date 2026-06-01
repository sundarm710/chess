// Longitudinal / conditional analysis for a player's tournament arc — "form & temperament".
// Pure functions over the per-game rows we already store (round, result, opponent, feature
// values), joined with opponent Elo from the tournament doc. No backend / no engine.

import type { GameRow, TournamentDoc } from '../types';

export type Outcome = 'W' | 'D' | 'L';
export const outcome = (score: number): Outcome => (score === 1 ? 'W' : score === 0.5 ? 'D' : 'L');
export const OUTCOME_COLOR: Record<Outcome, string> = { W: '#0F6E56', D: '#6b6052', L: '#9A3B2E' };

export type StreakState = 'start' | 'afterW' | 'afterD' | 'afterL' | 'after2L';
export const STREAK_ORDER: StreakState[] = ['start', 'afterW', 'afterD', 'afterL', 'after2L'];
export const STREAK_LABEL: Record<StreakState, string> = {
  start: 'Round 1',
  afterW: 'after a win',
  afterD: 'after a draw',
  afterL: 'after a loss',
  after2L: 'after 2+ losses',
};

export interface FormGame {
  round: number;
  value: number | null;
  score: number;
  outcome: Outcome;
  opp: string;
  color: 'w' | 'b';
  oppElo: number | null;
  ownElo: number | null;
  cum: number; // cumulative score after this game
  entering: StreakState; // streak state entering this game (from prior results)
}

const num = (x: string | number | undefined): number | null => {
  const n = typeof x === 'string' ? parseInt(x, 10) : x;
  return n != null && Number.isFinite(n) ? n : null;
};

/** id -> {welo, belo} for joining opponent/own Elo onto a player's rows. */
export function eloIndex(doc: TournamentDoc | null): Map<string, { welo: number | null; belo: number | null }> {
  const m = new Map<string, { welo: number | null; belo: number | null }>();
  for (const g of doc?.games ?? []) m.set(g.id, { welo: num(g.welo), belo: num(g.belo) });
  return m;
}

/** A player's games in round order, annotated with entering streak, cumulative score, Elos. */
export function formTimeline(
  rows: GameRow[],
  fid: string,
  elo: Map<string, { welo: number | null; belo: number | null }>,
): FormGame[] {
  const sorted = [...rows].sort((a, b) => a.round - b.round);
  const out: FormGame[] = [];
  const results: Outcome[] = [];
  let cum = 0;
  for (const r of sorted) {
    const oc = outcome(r.score);
    let entering: StreakState = 'start';
    const n = results.length;
    if (n >= 2 && results[n - 1] === 'L' && results[n - 2] === 'L') entering = 'after2L';
    else if (n >= 1) entering = results[n - 1] === 'W' ? 'afterW' : results[n - 1] === 'D' ? 'afterD' : 'afterL';
    cum += r.score;
    const e = elo.get(r.id);
    out.push({
      round: r.round,
      value: r.vals[fid] ?? null,
      score: r.score,
      outcome: oc,
      opp: r.opp,
      color: r.color,
      oppElo: e ? (r.color === 'w' ? e.belo : e.welo) : null,
      ownElo: e ? (r.color === 'w' ? e.welo : e.belo) : null,
      cum,
      entering,
    });
    results.push(oc);
  }
  return out;
}

export const overallMean = (games: FormGame[]): number | null => {
  const xs = games.map((g) => g.value).filter((v): v is number => v != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
};

export interface GroupStat<K extends string> {
  key: K;
  label: string;
  mean: number;
  n: number;
}

/** Mean of the feature over games grouped by a key (skips games missing the value/key). */
export function groupMeans<K extends string>(
  games: FormGame[],
  keyOf: (g: FormGame) => K | null,
  label: (k: K) => string,
): GroupStat<K>[] {
  const acc = new Map<K, { sum: number; n: number }>();
  for (const g of games) {
    if (g.value == null) continue;
    const k = keyOf(g);
    if (k == null) continue;
    const a = acc.get(k) ?? { sum: 0, n: 0 };
    a.sum += g.value;
    a.n += 1;
    acc.set(k, a);
  }
  return [...acc.entries()].map(([key, a]) => ({ key, label: label(key), mean: a.sum / a.n, n: a.n }));
}

/** Streak-conditioned means, in a sensible fixed order. */
export function byStreak(games: FormGame[]): GroupStat<StreakState>[] {
  const stats = groupMeans(games, (g) => g.entering, (k) => STREAK_LABEL[k]);
  return stats.sort((a, b) => STREAK_ORDER.indexOf(a.key) - STREAK_ORDER.indexOf(b.key));
}

/** Opponent-strength-conditioned means (stronger vs weaker than the player). */
export function byOpponentStrength(games: FormGame[]): GroupStat<'stronger' | 'weaker'>[] {
  return groupMeans(
    games,
    (g) => (g.oppElo != null && g.ownElo != null ? (g.oppElo >= g.ownElo ? 'stronger' : 'weaker') : null),
    (k) => (k === 'stronger' ? 'vs stronger' : 'vs weaker'),
  );
}
