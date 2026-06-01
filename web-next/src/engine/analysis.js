// Builds the unified per-ply analysis payload for the OFFLINE quick mode, in the
// exact shape the backend's GET /games/{id}/features returns. The UI renders from
// this object regardless of source, so quick mode and backend mode share one path.
//
// Shape:
//   { meta: {id -> {...}}, plies: [{ ply, fen, san, uci, mover,
//       features: [{ id, side, value, delta, status, evidence:{squares,layman,technical} }] }] }

import { BOARD_CATALOG, catalogManifest } from './catalog.js';
import { hangingSquares, kingZoneSquares, shieldSquares } from './highlights.js';

const SIDE_NAME = { w: 'White', b: 'Black', shared: 'Board' };

// Features whose value never decreases across a game (mirror orchestrator STICKY_MAX).
const STICKY_MAX = new Set(['KSF.castle']);

// Per-side evidence squares for the features whose value is spatial.
function evidenceSquares(board, featureId, side) {
  if (side === 'shared') return [];
  if (featureId === 'MAT.hanging') return hangingSquares(board, side);
  if (featureId === 'KSF.zone_pressure') return kingZoneSquares(board, side);
  if (featureId === 'KSF.shield') return shieldSquares(board, side);
  return [];
}

// A short human note explaining the move-to-move change.
function changeNote(cat, side, value, prev) {
  if (prev === null || prev === undefined) {
    return { layman: '', technical: `${cat.field} = ${value}` };
  }
  const delta = value - prev;
  const technical = `${cat.field} ${prev}→${value} (Δ${delta >= 0 ? '+' : ''}${delta})`;
  if (delta === 0) return { layman: '', technical };
  const who = side === 'shared' ? 'Board tension' : `${SIDE_NAME[side]}’s ${cat.name.toLowerCase()}`;
  const dir = delta > 0 ? 'rose' : 'fell';
  let tail = '';
  if (cat.higher === 'good') tail = delta > 0 ? ' — an improvement.' : ' — a step back.';
  else if (cat.higher === 'bad') tail = delta > 0 ? ' — a warning sign.' : ' — relief.';
  else tail = '.';
  return { layman: `${who} ${dir} by ${Math.abs(delta)}${tail}`, technical };
}

/**
 * @param {{fens: string[], boards: object[], feats: object[], moves: object[]}} input
 *   feats[i] = {w:{...}, b:{...}, tension}; moves[i] = {san, uci, mover} for ply i+1.
 */
export function buildAnalysis({ fens, boards, feats, moves }) {
  const plies = [];
  const last = new Map(); // `${id}|${side}` -> previous (sticky-adjusted) value, for deltas

  // Emit one feature result, applying stickiness and computing the delta vs `last`.
  const emit = (cat, side, raw, squares) => {
    const key = `${cat.id}|${side}`;
    const pv = last.has(key) ? last.get(key) : null;
    let value = raw;
    if (STICKY_MAX.has(cat.id) && pv != null && pv > value) value = pv;
    const delta = pv == null ? null : value - pv;
    const note = changeNote(cat, side, value, pv);
    last.set(key, value);
    return {
      id: cat.id, side, value, status: 'ok', delta,
      evidence: { squares: squares || [], layman: note.layman, technical: note.technical },
    };
  };

  for (let i = 0; i < boards.length; i++) {
    const board = boards[i];
    const feat = feats[i];
    const features = [];
    for (const cat of BOARD_CATALOG) {
      if (cat.side === 'shared') {
        features.push(emit(cat, 'shared', feat.tension, []));
      } else {
        for (const side of ['w', 'b']) {
          features.push(emit(cat, side, feat[side][cat.field], evidenceSquares(board, cat.id, side)));
        }
      }
    }
    const mv = i > 0 ? moves[i - 1] : null;
    plies.push({
      ply: i,
      fen: fens[i],
      san: mv ? mv.san : null,
      uci: mv ? mv.uci || null : null,
      mover: mv ? mv.mover : null,
      features,
    });
  }
  return { meta: catalogManifest(), plies };
}

/** Index a ply's features as byId[id][side] = featureResult, for O(1) table lookup. */
export function indexPly(ply) {
  const byId = {};
  for (const f of ply.features) {
    (byId[f.id] = byId[f.id] || {})[f.side] = f;
  }
  return byId;
}
