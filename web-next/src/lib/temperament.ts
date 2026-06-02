// Temperament clustering — the longitudinal "what kind of player is this, round by
// round" layer. We fold the ~38 raw features into a handful of *behavioral* clusters
// that cut across the positional headings (a cluster pulls from Dynamics + Tactics +
// Space, etc.), then express each cluster as a deviation from the player's OWN
// tournament baseline (a signed z-score) so the heatmap reads as "this trait was
// dialed up / down this round vs how this player normally plays". Pure + testable.

import type { FeatureMeta } from '../types';
import type { FormGame } from './form';

/** A member feature of a cluster, with the sign that aligns it to the cluster's
 *  meaning (+1: more of it = more of the trait; -1: less of it = more of the trait). */
export interface Member {
  fid: string;
  sign: 1 | -1;
}

export interface Temperament {
  key: string;
  label: string;
  blurb: string;
  members: Member[];
}

const m = (fid: string, sign: 1 | -1 = 1): Member => ({ fid, sign });

// The taxonomy. These are deliberately behavioral, not positional: a player's
// *temperament* is how aggressive / risk-tolerant / cautious / technical / disciplined
// / composed they are — each drawing on whichever raw features express it.
export const TEMPERAMENTS: Temperament[] = [
  {
    key: 'aggression',
    label: 'Aggression',
    blurb: 'Initiative, central thrust and attacking pressure — appetite for the fight.',
    members: [m('DYN.initiative'), m('TAC.density'), m('SPC.space'), m('SPC.center_control'), m('MAT.lead')],
  },
  {
    key: 'risk',
    label: 'Risk appetite',
    blurb: 'Loose material, held tension, swings and king exposure — willingness to live dangerously.',
    members: [
      m('TAC.exposure'),
      m('MAT.hanging'),
      m('MAT.swing'),
      m('MAT.deficit'),
      m('STR.tension_hold'),
      m('KSF.zone_pressure'),
      m('KSF.in_check'),
    ],
  },
  {
    key: 'caution',
    label: 'Caution',
    blurb: 'Prophylaxis, trade discipline and a sheltered king — safety-first instincts.',
    members: [m('DEC.prophylaxis'), m('DEC.trade_discipline'), m('KSF.shield'), m('KSF.castle')],
  },
  {
    key: 'craft',
    label: 'Technical craft',
    blurb: 'Piece activity, coordination, outposts and healthy bishops — the quiet-maestro axis.',
    members: [
      m('ACT.mobility'),
      m('ACT.coordination'),
      m('ACT.control'),
      m('ACT.outpost'),
      m('ACT.rook_open'),
      m('ACT.bishop_quality'),
      m('SPC.center_occ'),
      m('DEV.count'),
    ],
  },
  {
    key: 'structure',
    label: 'Structure discipline',
    blurb: 'Sound pawns — few islands, isolanis or doubled pawns; passers earned.',
    members: [m('STR.islands', -1), m('STR.isolated', -1), m('STR.doubled', -1), m('STR.passed')],
  },
  {
    key: 'composure',
    label: 'Composure',
    blurb: 'Clock kept, few time-trouble lapses, low and even error — calm under pressure.',
    members: [
      m('TIM.trouble', -1),
      m('TIM.clock'),
      m('EVAL.acpl', -1),
      m('EVAL.consistency', -1),
      m('DEV.tempo_waste', -1),
    ],
  },
  {
    key: 'endgame',
    label: 'Endgame tilt',
    blurb: 'Steering into endgames and thriving there — more time simplified, reached earlier, activity retained.',
    members: [m('END.endgame_share'), m('END.endgame_onset', -1), m('END.control_drift'), m('END.mobility_drift')],
  },
];

/** Sample standard deviation with a small floor so a near-constant feature reads as
 *  "flat" (z≈0) rather than exploding into ±∞. */
function std(xs: number[], mean: number): number {
  if (xs.length < 2) return 0;
  const v = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/** z-scores of a series against its own mean/std (nulls preserved as null). The std
 *  floor is relative to the mean's magnitude so the scale is dimension-agnostic. */
export function zscores(values: (number | null)[]): (number | null)[] {
  const xs = values.filter((v): v is number => v != null);
  if (xs.length === 0) return values.map(() => null);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const s = std(xs, mean);
  const floor = Math.max(1e-9, Math.abs(mean) * 0.02);
  const denom = s < floor ? floor : s;
  return values.map((v) => (v == null ? null : (v - mean) / denom));
}

export interface TempCell {
  z: number | null; // signed, trait-aligned deviation from the player's baseline
  value: number | null; // raw feature value (sub-rows) or null (cluster rows)
  n: number; // # of contributing members this round (cluster rows)
}

export interface FeatRow {
  fid: string;
  name: string;
  higher: FeatureMeta['higher'];
  sign: 1 | -1;
  cells: TempCell[];
}

export interface TempRow {
  key: string;
  label: string;
  blurb: string;
  members: string[]; // available member fids
  cells: TempCell[]; // cluster-level z per round
  features: FeatRow[]; // member breakdown (sub-rows)
}

/** Build the cluster × round matrix for one player.
 *  @param games   the player's per-round FormGame list (already in round order)
 *  @param valueOf (game, fid) -> the raw feature value for that game (or null)
 *  @param available set of feature ids that are actually populated for this field
 *  @param meta    feature metadata (for names + good/bad direction) */
export function buildTemperament(
  games: FormGame[],
  valueOf: (g: FormGame, fid: string) => number | null,
  available: Set<string>,
  meta: Record<string, FeatureMeta>,
): TempRow[] {
  const rows: TempRow[] = [];
  for (const t of TEMPERAMENTS) {
    const usable = t.members.filter((mm) => available.has(mm.fid));
    if (usable.length === 0) continue;

    // Per-member trait-aligned z series.
    const featRows: FeatRow[] = usable.map((mm) => {
      const raw = games.map((g) => valueOf(g, mm.fid));
      const z = zscores(raw);
      return {
        fid: mm.fid,
        name: meta[mm.fid]?.name ?? mm.fid,
        higher: meta[mm.fid]?.higher ?? 'neutral',
        sign: mm.sign,
        cells: games.map((_, i) => ({
          z: z[i] == null ? null : (z[i] as number) * mm.sign,
          value: raw[i],
          n: 1,
        })),
      };
    });

    // Cluster z per round = mean of the available members' aligned z that round.
    const cells: TempCell[] = games.map((_, i) => {
      const zs = featRows.map((f) => f.cells[i].z).filter((z): z is number => z != null);
      return { z: zs.length ? zs.reduce((a, b) => a + b, 0) / zs.length : null, value: null, n: zs.length };
    });

    rows.push({ key: t.key, label: t.label, blurb: t.blurb, members: usable.map((u) => u.fid), cells, features: featRows });
  }
  return rows;
}

/** Diverging colour: warm (oxblood) above the player's baseline, cool (deep blue)
 *  below, paper at baseline. `z` is clamped to ±ZMAX for saturation. */
export const ZMAX = 1.6;
const PAPER = [0xf4, 0xf0, 0xe7];
const UP = [0x9a, 0x3b, 0x2e]; // --color-w oxblood (trait amplified)
const DOWN = [0x1f, 0x56, 0x73]; // --color-b deep blue (trait damped)

export function tempColor(z: number | null): string {
  if (z == null) return 'var(--color-paper2)';
  const t = Math.min(1, Math.abs(z) / ZMAX);
  const target = z >= 0 ? UP : DOWN;
  const mix = PAPER.map((p, i) => Math.round(p + (target[i] - p) * t));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

/** Readable text colour over a given cell (white once the cell is dark enough). */
export function tempInk(z: number | null): string {
  return z != null && Math.abs(z) / ZMAX > 0.55 ? '#f4f0e7' : 'var(--color-ink2)';
}

/** Project a single cluster/feature's z series onto FormGame.value so the existing
 *  byStreak / byOpponentStrength conditioning + line chart can be reused as-is. */
export function asSeries(games: FormGame[], cells: TempCell[]): FormGame[] {
  return games.map((g, i) => ({ ...g, value: cells[i]?.z ?? null }));
}
