// Board-highlight helpers: given a board and a selected feature, return the squares
// that explain the value, so the explanation panel can light them up on the board.
//
// Computed client-side from the position (works in both quick and backend modes),
// using only engine.js's public API — no duplicate feature math.

import { Board, PIECE_VALUES, opposite } from './engine.js';

const sq = (file, rank) => 'abcdefgh'[file] + (rank + 1);
const KING_ZONE = [[0, 0], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/** Squares of `color`'s pieces that are en prise (attacked & under-defended). */
export function hangingSquares(board, color) {
  const opp = opposite(color);
  const out = [];
  for (const [f, r, p] of board.pieces(color)) {
    if (p.type === 'k') continue;
    const attackers = board.attackers(f, r, opp);
    if (!attackers.length) continue;
    const defenders = board.attackers(f, r, color);
    const cheapest = Math.min(...attackers.map((t) => PIECE_VALUES[t]));
    if (defenders.length === 0 || cheapest < p.value) out.push(sq(f, r));
  }
  return out;
}

/** Squares in `color`'s king zone (king + 8 neighbors) that the enemy attacks. */
export function kingZoneSquares(board, color) {
  const opp = opposite(color);
  let kf = -1;
  let kr = -1;
  for (const [f, r, p] of board.pieces(color)) {
    if (p.type === 'k') { kf = f; kr = r; break; }
  }
  if (kf < 0) return [];
  const out = [];
  for (const [df, dr] of KING_ZONE) {
    const f = kf + df;
    const r = kr + dr;
    if (Board.inBounds(f, r) && board.isAttackedBy(f, r, opp)) out.push(sq(f, r));
  }
  return out;
}

/** `color`'s own pawns shielding its king (3 files around, 2 ranks in front). */
export function shieldSquares(board, color) {
  let kf = -1;
  let kr = -1;
  for (const [f, r, p] of board.pieces(color)) {
    if (p.type === 'k') { kf = f; kr = r; break; }
  }
  if (kf < 0) return [];
  const front = color === 'w' ? [1, 2] : [-1, -2];
  const out = [];
  for (const df of [-1, 0, 1]) {
    for (const dr of front) {
      const f = kf + df;
      const r = kr + dr;
      if (Board.inBounds(f, r)) {
        const p = board.pieceAt(f, r);
        if (p && p.type === 'p' && p.color === color) out.push(sq(f, r));
      }
    }
  }
  return out;
}

/**
 * Squares to highlight for a selected feature, with a `kind` driving the color
 * (bad = under attack, good = protective, neutral = informational).
 * @returns {{squares: string[], kind: 'good'|'bad'|'neutral'}}
 */
export function highlightsFor(board, featureId) {
  switch (featureId) {
    case 'MAT.hanging':
      return { squares: [...hangingSquares(board, 'w'), ...hangingSquares(board, 'b')], kind: 'bad' };
    case 'KSF.zone_pressure':
      return { squares: [...kingZoneSquares(board, 'w'), ...kingZoneSquares(board, 'b')], kind: 'bad' };
    case 'KSF.shield':
      return { squares: [...shieldSquares(board, 'w'), ...shieldSquares(board, 'b')], kind: 'good' };
    case 'SPC.center_control':
      return { squares: ['d4', 'e4', 'd5', 'e5'], kind: 'neutral' };
    default:
      return { squares: [], kind: 'neutral' };
  }
}
