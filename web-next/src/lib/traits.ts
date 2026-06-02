// Field-relative trait aggregation for the Profiles tab. The Form view z-scores a
// player against their OWN baseline (longitudinal); here we instead z-score each
// player against the FIELD, so "most aggressive in this tournament" is meaningful and
// players can be ranked on a trait. Same six behavioural traits as the Form heatmap
// (shared TEMPERAMENTS config), folded from whichever member features are populated.

import type { FeatureMeta, GameRow, Profile } from '../types';
import { TEMPERAMENTS } from './temperament';
import { type SliceSel, availableFeatures, isOk, playersByScore, sliceValue } from './profile';

export interface TraitMember {
  fid: string;
  sign: 1 | -1; // +1: more = more of the trait; -1: inverted (e.g. fewer islands = more discipline)
  name: string;
  higher: FeatureMeta['higher'];
}

export interface TraitDef {
  key: string;
  label: string;
  blurb: string;
  members: TraitMember[];
}

/** The traits available for this field, with each trait's *populated* member features. */
export function availableTraits(p: Profile): TraitDef[] {
  const avail = new Set(availableFeatures(p));
  const out: TraitDef[] = [];
  for (const t of TEMPERAMENTS) {
    const members = t.members
      .filter((m) => avail.has(m.fid))
      .map((m) => ({ fid: m.fid, sign: m.sign, name: p.meta[m.fid]?.name ?? m.fid, higher: p.meta[m.fid]?.higher ?? 'neutral' }));
    if (members.length) out.push({ key: t.key, label: t.label, blurb: t.blurb, members });
  }
  return out;
}

interface Stat {
  mean: number;
  std: number;
}
export type FeatStats = Record<string, Stat>;

function std(xs: number[], mean: number): number {
  if (xs.length < 2) return 0;
  const v = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/** Per-feature normaliser: mean/std of qualified players' slice means (std floored so a
 *  near-flat feature can't blow up the z). Only features with ≥2 qualified players. */
export function fieldFeatStats(p: Profile, fids: string[], sel: SliceSel): FeatStats {
  const out: FeatStats = {};
  for (const fid of fids) {
    const xs = playersByScore(p)
      .map(([, d]) => sliceValue(d, fid, sel))
      .filter((s) => isOk(s) && s.n >= p.n_min)
      .map((s) => s.mean);
    if (xs.length < 2) continue;
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const s = std(xs, mean);
    const floor = Math.max(1e-9, Math.abs(mean) * 0.02);
    out[fid] = { mean, std: s < floor ? floor : s };
  }
  return out;
}

/** Trait-aligned z of a single value against a field stat. */
export function alignedZ(value: number | null, st: Stat | undefined, sign: 1 | -1): number | null {
  if (value == null || !st) return null;
  return (sign * (value - st.mean)) / st.std;
}

export interface TraitCell {
  z: number | null;
  n: number; // # of contributing members
}

export interface TraitRow {
  name: string;
  score: number;
  perf: number | null;
  traits: Record<string, TraitCell>; // trait key -> aggregate z
  feats: Record<string, number | null>; // member fid -> aligned z
}

export interface TraitTable {
  traits: TraitDef[];
  rows: TraitRow[];
  stats: FeatStats;
}

/** The full players × traits table for a slice. */
export function traitTable(p: Profile, sel: SliceSel): TraitTable {
  const traits = availableTraits(p);
  const signByFid = new Map<string, 1 | -1>();
  for (const t of traits) for (const m of t.members) signByFid.set(m.fid, m.sign);
  const fids = [...signByFid.keys()];
  const stats = fieldFeatStats(p, fids, sel);

  const rows: TraitRow[] = playersByScore(p).map(([name, d]) => {
    const feats: Record<string, number | null> = {};
    for (const fid of fids) {
      const s = sliceValue(d, fid, sel);
      feats[fid] = isOk(s) ? alignedZ(s.mean, stats[fid], signByFid.get(fid)!) : null;
    }
    const traitCells: Record<string, TraitCell> = {};
    for (const t of traits) {
      const zs = t.members.map((m) => feats[m.fid]).filter((z): z is number => z != null);
      traitCells[t.key] = { z: zs.length ? zs.reduce((a, b) => a + b, 0) / zs.length : null, n: zs.length };
    }
    return { name, score: d.score, perf: d.performance_elo, traits: traitCells, feats };
  });

  return { traits, rows, stats };
}

/** A single game's trait z (using the field normaliser from traitTable), for sorting a
 *  player's games by "how aggressive / risky / … was this game vs the field". */
export function gameTraitZ(vals: Record<string, number> | undefined, t: TraitDef, stats: FeatStats): TraitCell {
  if (!vals) return { z: null, n: 0 };
  const zs = t.members.map((m) => alignedZ(vals[m.fid] ?? null, stats[m.fid], m.sign)).filter((z): z is number => z != null);
  return { z: zs.length ? zs.reduce((a, b) => a + b, 0) / zs.length : null, n: zs.length };
}

// ── correlations (for the Insights drawer) ────────────────────────────────────

const CORR_MIN_N = 10;

export function pearson(pairs: [number, number][]): number | null {
  const n = pairs.length;
  if (n < 3) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pairs) {
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  const cov = n * sxy - sx * sy;
  const dx = n * sxx - sx * sx;
  const dy = n * syy - sy * sy;
  const d = Math.sqrt(dx * dy);
  return d === 0 ? null : cov / d;
}

export interface TraitCorr {
  key: string;
  label: string;
  r: number;
  n: number;
}

const phaseVals = (r: GameRow, phase: SliceSel['phase']): Record<string, number> | undefined =>
  phase === 'all' ? r.vals : r.phase_vals?.[phase];

/** Per-trait Pearson r between a game's trait z and its result (win 1 · draw .5 · loss 0),
 *  pooled across all players' games — the trait analogue of `result_correlation`. */
export function traitResultCorr(p: Profile, sel: SliceSel, tbl: TraitTable): TraitCorr[] {
  const out: TraitCorr[] = [];
  for (const t of tbl.traits) {
    const pairs: [number, number][] = [];
    for (const d of Object.values(p.players)) {
      for (const r of d.game_rows) {
        if (sel.color !== 'all' && r.color !== sel.color) continue;
        const z = gameTraitZ(phaseVals(r, sel.phase), t, tbl.stats).z;
        if (z != null) pairs.push([z, r.score]);
      }
    }
    const rr = pearson(pairs);
    if (rr != null && pairs.length >= CORR_MIN_N) out.push({ key: t.key, label: t.label, r: rr, n: pairs.length });
  }
  return out;
}

/** Trait × trait Pearson r over all player-games (game-level trait z vectors). */
export function traitCorrMatrix(p: Profile, sel: SliceSel, tbl: TraitTable): { traits: TraitDef[]; r: (number | null)[][] } {
  const traits = tbl.traits;
  // game-level z per trait, collected once per game
  const cols: number[][] = traits.map(() => []);
  for (const d of Object.values(p.players)) {
    for (const r of d.game_rows) {
      if (sel.color !== 'all' && r.color !== sel.color) continue;
      const vals = phaseVals(r, sel.phase);
      const zs = traits.map((t) => gameTraitZ(vals, t, tbl.stats).z);
      if (zs.some((z) => z == null)) continue; // only games scoring every trait, so columns align
      zs.forEach((z, i) => cols[i].push(z as number));
    }
  }
  const r = traits.map((_, i) =>
    traits.map((__, j) => (i === j ? 1 : pearson(cols[i].map((x, k) => [x, cols[j][k]] as [number, number])))),
  );
  return { traits, r };
}
