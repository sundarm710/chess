// The shared abstraction behind the Profiles matrices. A *Metric* is anything measurable
// for a player (an aggregate over their games) AND for a single game, with a good/bad
// direction. Features and traits are both just Metrics, grouped differently — so one
// matrix component and one per-game breakdown component serve both (no duplication).

import type { GameRow, Higher, Profile } from '../types';
import {
  type FightStats,
  type SliceSel,
  CATEGORY_LABEL,
  featuresByCategory,
  fightStats,
  isOk,
  playersByScore,
  sliceValue,
} from './profile';
import { type TraitTable, gameTraitZ } from './traits';

export interface Cell {
  mean: number;
  n: number;
  approx?: boolean;
}

export interface Metric {
  id: string;
  label: string;
  desc: string;
  higher: Higher;
  aggregate: boolean; // true: a trait roll-up column (z-score), false: a raw feature
  player: (name: string) => Cell | null;
  game: (row: GameRow) => number | null;
}

export interface MetricGroup {
  key: string;
  label: string;
  blurb?: string;
  lead?: Metric; // optional aggregate column shown first (traits); features have none
  members: Metric[];
}

const valsOf = (sel: SliceSel, r: GameRow): Record<string, number> | undefined =>
  sel.phase === 'all' ? r.vals : r.phase_vals?.[sel.phase];

/** One raw feature as a Metric (the atom shared by the feature matrix and trait members). */
export function featureMetric(p: Profile, sel: SliceSel, fid: string): Metric {
  return {
    id: fid,
    label: p.meta[fid]?.name ?? fid,
    desc: p.meta[fid]?.description ?? '',
    higher: p.meta[fid]?.higher ?? 'neutral',
    aggregate: false,
    player: (name) => {
      const s = sliceValue(p.players[name], fid, sel);
      return isOk(s) ? { mean: s.mean, n: s.n, approx: s.approx } : null;
    },
    game: (row) => valsOf(sel, row)?.[fid] ?? null,
  };
}

/** Features grouped by category — the feature matrix's column model. */
export function featureGroups(p: Profile, sel: SliceSel): MetricGroup[] {
  return featuresByCategory(p).map((g) => ({
    key: g.cat,
    label: CATEGORY_LABEL[g.cat] ?? g.cat,
    members: g.ids.map((fid) => featureMetric(p, sel, fid)),
  }));
}

/** Traits grouped — each group = a trait roll-up (lead, z-score) + its member features
 *  (raw, coloured by their own direction, exactly like the feature matrix). */
export function traitGroups(p: Profile, sel: SliceSel, tbl: TraitTable): MetricGroup[] {
  const byName = new Map(tbl.rows.map((r) => [r.name, r]));
  return tbl.traits.map((t) => {
    const lead: Metric = {
      id: `trait:${t.key}`,
      label: t.label,
      desc: t.blurb,
      higher: 'good', // z is already sign-aligned: higher = more of the trait → greener
      aggregate: true,
      player: (name) => {
        const c = byName.get(name)?.traits[t.key];
        return c && c.z != null ? { mean: c.z, n: c.n } : null;
      },
      game: (row) => gameTraitZ(valsOf(sel, row), t, tbl.stats).z,
    };
    return { key: t.key, label: t.label, blurb: t.blurb, lead, members: t.members.map((m) => featureMetric(p, sel, m.fid)) };
  });
}

export interface PrefixCol {
  id: string;
  label: string;
  desc?: string;
  value: (name: string) => number | null;
  fmt: (v: number | null) => string;
  title?: (name: string) => string | undefined;
}

const pct = (v: number | null) => (v == null ? '–' : `${Math.round(v * 100)}%`);
const num0 = (v: number | null) => (v == null ? '–' : String(Math.round(v)));
const num2 = (v: number | null) => (v == null || !Number.isFinite(v) ? '–' : Number.isInteger(v) ? String(v) : (Math.round(v * 100) / 100).toFixed(2));

/** Player-level context columns shared by both matrices (slice-independent), so the two
 *  tables share the same left edge + width. */
export function playerPrefix(p: Profile): PrefixCol[] {
  const fight = new Map<string, FightStats>(Object.entries(p.players).map(([n, d]) => [n, fightStats(d)]));
  return [
    { id: 'score', label: 'Pts', value: (n) => p.players[n]?.score ?? null, fmt: num2 },
    { id: 'perf', label: 'TPR', desc: 'Linear tournament performance rating', value: (n) => p.players[n]?.performance_elo ?? null, fmt: num0 },
    {
      id: 'resil', label: 'Resil', desc: 'Share of games ≥3 behind that were not lost',
      value: (n) => fight.get(n)?.resilience ?? null, fmt: pct,
      title: (n) => `saved ${fight.get(n)?.nBehind ?? 0} games behind ≥3`,
    },
    {
      id: 'conv', label: 'Conv', desc: 'Share of games ≥3 ahead that were won',
      value: (n) => fight.get(n)?.conversion ?? null, fmt: pct,
      title: (n) => `from ${fight.get(n)?.nAhead ?? 0} games ahead ≥3`,
    },
  ];
}

export interface Range {
  lo: number;
  hi: number;
}

/** Field range of a metric over qualified players, for red→green colour scaling. */
export function metricRange(metric: Metric, names: string[], nMin: number): Range {
  const xs = names.map((n) => metric.player(n)).filter((c): c is Cell => c != null && c.n >= nMin).map((c) => c.mean);
  return xs.length ? { lo: Math.min(...xs), hi: Math.max(...xs) } : { lo: 0, hi: 0 };
}

/** Ranges for every metric in a set of groups (lead + members), keyed by metric id. */
export function groupRanges(groups: MetricGroup[], names: string[], nMin: number): Map<string, Range> {
  const m = new Map<string, Range>();
  for (const g of groups) {
    if (g.lead) m.set(g.lead.id, metricRange(g.lead, names, nMin));
    for (const mem of g.members) m.set(mem.id, metricRange(mem, names, nMin));
  }
  return m;
}

/** All players in score order (the default row ordering). */
export const playerNames = (p: Profile): string[] => playersByScore(p).map(([n]) => n);
