// Pure, typed view-logic — the same slice/rank/goodness math as the vanilla app,
// but type-checked and unit-testable in isolation (no DOM).

import type { Higher, PlayerDoc, Profile, Slice } from '../types';

// Material gap (points) that counts as "behind" / "ahead" for the fight-and-defence stats.
export const FIGHT_THRESHOLD = 3;

export interface FightStats {
  nBehind: number;
  nAhead: number;
  resilience: number | null; // share of games sustainably behind ≥threshold not lost
  conversion: number | null; // share of games sustainably ahead ≥threshold won
}

/** Fight & defence record for a player, derived from per-game *sustained* worst-deficit /
 *  best-lead (the MAT.deficit / MAT.lead features) and the game result. */
export function fightStats(d: PlayerDoc): FightStats {
  let nBehind = 0, saved = 0, nAhead = 0, convWon = 0;
  for (const r of d.game_rows) {
    const deficit = r.vals['MAT.deficit'] ?? 0;
    const lead = r.vals['MAT.lead'] ?? 0;
    if (deficit >= FIGHT_THRESHOLD) {
      nBehind++;
      if (r.score > 0) saved++;
    }
    if (lead >= FIGHT_THRESHOLD) {
      nAhead++;
      if (r.score === 1) convWon++;
    }
  }
  return {
    nBehind,
    nAhead,
    resilience: nBehind ? saved / nBehind : null,
    conversion: nAhead ? convWon / nAhead : null,
  };
}

export const PHASES = ['opening', 'middlegame', 'endgame'] as const;
export const PHASE_LABEL: Record<string, string> = {
  opening: 'Opening',
  middlegame: 'Middlegame',
  endgame: 'Endgame',
};

// Stable category order + human labels so feature columns group sensibly.
const CAT_ORDER = ['MAT', 'SPC', 'KSF', 'STR', 'DEV', 'ACT', 'DYN', 'TAC', 'DEC', 'END', 'TIM', 'EVAL'];
export const CATEGORY_LABEL: Record<string, string> = {
  MAT: 'Material',
  SPC: 'Space',
  KSF: 'King safety',
  STR: 'Structure',
  DEV: 'Development',
  ACT: 'Activity',
  DYN: 'Dynamics',
  TAC: 'Tactics',
  DEC: 'Decisions',
  END: 'Endgame',
  TIM: 'Time',
  EVAL: 'Evaluation',
};

export interface SliceSel {
  phase: 'all' | (typeof PHASES)[number];
  color: 'all' | 'w' | 'b';
}

/** Profiles-tab UI state — lifted to App so it survives tab switches and game
 *  round-trips (the player is shared separately, across Form + Profiles). The two
 *  matrices each track their own focused column; the table itself never re-sorts
 *  (always points order), so focus only drives the right-hand ranking panel. */
export interface ProfUi {
  sel: SliceSel;
  featFocus: string; // focused feature column → feature right panel
  traitFocus: string; // focused trait/member column → temperament right panel
  expanded: string[]; // expanded trait keys (member features shown)
}

export const DEFAULT_PROF_UI: ProfUi = {
  sel: { phase: 'all', color: 'all' },
  featFocus: 'SPC.space',
  traitFocus: 'trait:aggression',
  expanded: [],
};

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
  const c = Math.max(0, Math.min(1, g)); // clamp: per-game values can fall outside the field's mean range
  const hue = c * 120; // red→green (never past green into blue/purple)
  return `hsl(${hue}, 55%, ${91 - Math.abs(c - 0.5) * 14}%)`;
}

// Warm "analytical instrument" categorical palette — White (oxblood) and Black (deep
// blue) lead, then earthy tones. No off-theme purple/indigo.
export const PALETTE = ['#9A3B2E', '#1F5673', '#0F6E56', '#C0882E', '#5D6A37', '#2F6F6A', '#A85A3C', '#6B4A2E'];
export const MAX_RADAR_PLAYERS = 8;
const CLUSTER_MAX = 8; // features per radar

/** Available features packed into category-coherent clusters of <= CLUSTER_MAX. */
export function clusters(p: Profile): { ids: string[]; title: string }[] {
  const out: string[][] = [];
  let cur: string[] = [];
  for (const g of featuresByCategory(p)) {
    if (cur.length && cur.length + g.ids.length > CLUSTER_MAX) {
      out.push(cur);
      cur = [];
    }
    cur.push(...g.ids);
  }
  if (cur.length) out.push(cur);
  if (out.length >= 2 && out[out.length - 1].length < 3) {
    const last = out.pop()!;
    out[out.length - 1].push(...last);
  }
  const title = (ids: string[]) => {
    const cats: string[] = [];
    for (const id of ids) {
      const c = p.meta[id]?.category ?? '';
      if (!cats.includes(c)) cats.push(c);
    }
    return cats.map((c) => CATEGORY_LABEL[c] ?? c).join(' · ');
  };
  return out.map((ids) => ({ ids, title: title(ids) }));
}

/** Features grouped by category, in CAT_ORDER. */
export function featuresByCategory(p: Profile): { cat: string; label: string; ids: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const id of availableFeatures(p)) {
    const cat = p.meta[id]?.category ?? '';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(id);
  }
  return [...groups.entries()].map(([cat, ids]) => ({ cat, label: CATEGORY_LABEL[cat] ?? cat, ids }));
}

export interface RankRow {
  name: string;
  mean: number;
  n: number;
}

/** Players ranked for a feature under a slice; sub-min-n pushed to the bottom. */
export function rankedEntries(p: Profile, fid: string, sel: SliceSel, nMin: number): RankRow[] {
  const higher = p.meta[fid]?.higher ?? 'neutral';
  const rows: RankRow[] = [];
  for (const [name, d] of Object.entries(p.players)) {
    const s = sliceValue(d, fid, sel);
    if (isOk(s)) rows.push({ name, mean: s.mean, n: s.n });
  }
  const asc = higher === 'bad';
  rows.sort(
    (a, b) => Number(a.n < nMin) - Number(b.n < nMin) || (asc ? a.mean - b.mean : b.mean - a.mean),
  );
  return rows;
}

export interface Mover {
  id: string;
  name: string;
  r: number;
}

/** Top +r / top -r features by correlation with the game result, for a phase. */
export function topMovers(p: Profile, phase: SliceSel['phase'], k = 6): { up: Mover[]; down: Mover[] } {
  const avail = new Set(availableFeatures(p));
  const all: Mover[] = [];
  for (const [id, rc] of Object.entries(p.result_correlation)) {
    if (!avail.has(id)) continue;
    const r = phase === 'all' ? rc.r : rc.phases?.[phase]?.r;
    if (r == null) continue;
    all.push({ id, name: p.meta[id]?.name ?? id, r });
  }
  return {
    up: all.filter((m) => m.r > 0).sort((a, b) => b.r - a.r).slice(0, k),
    down: all.filter((m) => m.r < 0).sort((a, b) => a.r - b.r).slice(0, k),
  };
}

/** One-sentence narrative of what tracked winning/losing in this field. */
export function takeaway(p: Profile, phase: SliceSel['phase']): string | null {
  const { up, down } = topMovers(p, phase, 2);
  if (!up.length && !down.length) return null;
  const names = (xs: Mover[]) => xs.map((m) => m.name).join(' and ');
  const where = phase === 'all' ? 'In this field' : `In the ${PHASE_LABEL[phase].toLowerCase()}`;
  const parts: string[] = [];
  if (up.length) parts.push(`winners showed more ${names(up)}`);
  if (down.length) parts.push(`${names(down)} tracked losses`);
  return `${where}, ${parts.join('; ')}.`;
}
