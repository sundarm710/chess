// Engine-free positional feature engine (JS port).
//
// Mirrors engine/chesslab/features.py EXACTLY — Python is the source of truth
// (CLAUDE.md §3, §6). Same OO shape: Piece, Board, FeatureEngine, plus the
// functional contract (features / sideFeats) as thin wrappers. Parity is a
// tested invariant: web/test/parity.mjs asserts identical numbers on the golden
// corpus exported from the Python side.
//
// Pure board logic. Nothing here depends on chess.js (that's only for move
// application in parser.js).

export const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const KNIGHT_OFFSETS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING_OFFSETS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const DIAGONAL = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTHOGONAL = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Home squares of developable minors, "file,rank". Knights b/g, bishops c/f.
const MINOR_HOME = {
  w: new Set(['1,0', '6,0', '2,0', '5,0']),
  b: new Set(['1,7', '6,7', '2,7', '5,7']),
};
const KING_HOME = { w: '4,0', b: '4,7' };
const CENTER_SQUARES = [[3, 3], [4, 3], [3, 4], [4, 4]];

/** @param {'w'|'b'} color */
export const opposite = (color) => (color === 'w' ? 'b' : 'w');

/** A single piece: type ('pnbrqk') and color ('w'|'b'). */
export class Piece {
  /** @param {string} type @param {'w'|'b'} color */
  constructor(type, color) {
    this.type = type;
    this.color = color;
    Object.freeze(this);
  }
  /** Material value (CLAUDE.md §6). */
  get value() {
    return PIECE_VALUES[this.type];
  }
}

/**
 * 8x8 board indexed grid[file][rank] (file 0=a..7=h, rank 0=rank1..7=rank8),
 * built from FEN. Owns the project's own attack generation.
 */
export class Board {
  static SIZE = 8;

  /** @param {(Piece|null)[][]} grid */
  constructor(grid) {
    this.grid = grid;
  }

  /** Build a board from the placement field of a FEN string. */
  static fromFen(fen) {
    const size = Board.SIZE;
    const grid = Array.from({ length: size }, () => Array(size).fill(null));
    const rows = fen.split(' ')[0].split('/');
    if (rows.length !== size) {
      throw new Error(`FEN must have ${size} ranks, got ${rows.length}: ${fen}`);
    }
    for (let i = 0; i < size; i++) {
      const rank = size - 1 - i; // FEN lists rank 8 first; our rank 0 is rank 1.
      let file = 0;
      for (const ch of rows[i]) {
        if (/\d/.test(ch)) {
          file += +ch;
        } else if (ch.toLowerCase() in PIECE_VALUES) {
          if (file >= size) throw new Error(`FEN rank ${rows[i]} overflows 8 files`);
          const color = ch === ch.toLowerCase() ? 'b' : 'w';
          grid[file][rank] = new Piece(ch.toLowerCase(), color);
          file++;
        } else {
          throw new Error(`FEN rank ${rows[i]} has invalid symbol ${ch}`);
        }
      }
      if (file !== size) throw new Error(`FEN rank ${rows[i]} does not fill 8 files`);
    }
    return new Board(grid);
  }

  static inBounds(file, rank) {
    return file >= 0 && file < Board.SIZE && rank >= 0 && rank < Board.SIZE;
  }

  pieceAt(file, rank) {
    return this.grid[file][rank];
  }

  *squares() {
    for (let file = 0; file < Board.SIZE; file++) {
      for (let rank = 0; rank < Board.SIZE; rank++) yield [file, rank];
    }
  }

  *pieces(color = null) {
    for (const [file, rank] of this.squares()) {
      const piece = this.grid[file][rank];
      if (piece && (color === null || piece.color === color)) yield [file, rank, piece];
    }
  }

  /**
   * Piece types of `color` that attack (targetFile, targetRank). Returns the list
   * (not a count) because the hanging test needs the cheapest attacker value.
   */
  attackers(targetFile, targetRank, color) {
    const out = [];
    const g = this.grid;

    const pawnRank = color === 'w' ? targetRank - 1 : targetRank + 1;
    for (const ff of [targetFile - 1, targetFile + 1]) {
      if (Board.inBounds(ff, pawnRank)) {
        const p = g[ff][pawnRank];
        if (p && p.color === color && p.type === 'p') out.push('p');
      }
    }

    for (const [df, dr] of KNIGHT_OFFSETS) {
      const f = targetFile + df, r = targetRank + dr;
      if (Board.inBounds(f, r)) {
        const p = g[f][r];
        if (p && p.color === color && p.type === 'n') out.push('n');
      }
    }

    for (const [df, dr] of KING_OFFSETS) {
      const f = targetFile + df, r = targetRank + dr;
      if (Board.inBounds(f, r)) {
        const p = g[f][r];
        if (p && p.color === color && p.type === 'k') out.push('k');
      }
    }

    for (const [df, dr] of DIAGONAL) {
      let f = targetFile + df, r = targetRank + dr;
      while (Board.inBounds(f, r)) {
        const p = g[f][r];
        if (p) {
          if (p.color === color && (p.type === 'b' || p.type === 'q')) out.push(p.type);
          break;
        }
        f += df; r += dr;
      }
    }

    for (const [df, dr] of ORTHOGONAL) {
      let f = targetFile + df, r = targetRank + dr;
      while (Board.inBounds(f, r)) {
        const p = g[f][r];
        if (p) {
          if (p.color === color && (p.type === 'r' || p.type === 'q')) out.push(p.type);
          break;
        }
        f += df; r += dr;
      }
    }

    return out;
  }

  isAttackedBy(file, rank, color) {
    return this.attackers(file, rank, color).length > 0;
  }

  /**
   * Squares the piece on (file, rank) attacks. Pawns: diagonal capture squares only;
   * sliders: up to and including the first blocker. Mirrors Board.attacks_from (Python).
   */
  attacksFrom(file, rank) {
    const piece = this.grid[file][rank];
    if (!piece) return [];
    const out = [];
    const t = piece.type;
    if (t === 'p') {
      const dr = piece.color === 'w' ? 1 : -1;
      for (const df of [-1, 1]) {
        const f = file + df, r = rank + dr;
        if (Board.inBounds(f, r)) out.push([f, r]);
      }
    } else if (t === 'n') {
      for (const [df, dr] of KNIGHT_OFFSETS) {
        const f = file + df, r = rank + dr;
        if (Board.inBounds(f, r)) out.push([f, r]);
      }
    } else if (t === 'k') {
      for (const [df, dr] of KING_OFFSETS) {
        const f = file + df, r = rank + dr;
        if (Board.inBounds(f, r)) out.push([f, r]);
      }
    } else {
      const dirs = [];
      if (t === 'b' || t === 'q') dirs.push(...DIAGONAL);
      if (t === 'r' || t === 'q') dirs.push(...ORTHOGONAL);
      for (const [df, dr] of dirs) {
        let f = file + df, r = rank + dr;
        while (Board.inBounds(f, r)) {
          out.push([f, r]);
          if (this.grid[f][r]) break;
          f += df; r += dr;
        }
      }
    }
    return out;
  }
}

/** Stateless engine computing per-side and full-position features from a Board. */
export class FeatureEngine {
  /** Per-side feature vector for `color` (CLAUDE.md §6 table). */
  sideFeatures(board, color) {
    const opp = opposite(color);
    const control = this._control(board, color);
    const space = this._space(board, color);
    const center = this._center(board, color);
    const { mat, dev, kingSq, hang_ct, hang_val } = this._materialDevHang(board, color, opp);
    const { kp, shield, castled } = this._kingFeatures(board, color, opp, kingSq);
    const center_occ = this._centerOcc(board, color);
    const { islands, isolated, doubled, passed } = this._pawnStructure(board, color, opp);
    const rook_open = this._rookOpen(board, color);
    const mobility = this._mobility(board, color);
    const outpost = this._outposts(board, color, opp);
    const bishop_quality = this._bishopQuality(board, color);
    const coordination = this._coordination(board, color);
    const colour_complex = this._colourComplex(board, color);
    const in_check = kingSq && board.isAttackedBy(kingSq[0], kingSq[1], opp) ? 1 : 0;
    return {
      control, space, center, hang_ct, hang_val, kp, shield, mat, dev, castled,
      center_occ, islands, isolated, doubled, passed, rook_open, mobility,
      outpost, bishop_quality, coordination, colour_complex, in_check,
    };
  }

  /** # of occupied squares attacked by the enemy AND defended by the owner. */
  tension(board) {
    let count = 0;
    for (const [file, rank, piece] of board.pieces()) {
      const opp = opposite(piece.color);
      if (board.isAttackedBy(file, rank, opp) && board.isAttackedBy(file, rank, piece.color)) count++;
    }
    return count;
  }

  /** Both sides' features plus shared tension. */
  features(board) {
    return {
      w: this.sideFeatures(board, 'w'),
      b: this.sideFeatures(board, 'b'),
      tension: this.tension(board),
    };
  }

  _control(board, color) {
    let n = 0;
    for (const [f, r] of board.squares()) if (board.isAttackedBy(f, r, color)) n++;
    return n;
  }

  _space(board, color) {
    let space = 0;
    for (const [f, r] of board.squares()) {
      if (!board.isAttackedBy(f, r, color)) continue;
      if ((color === 'w' && r >= 4) || (color === 'b' && r <= 3)) space++;
    }
    return space;
  }

  _center(board, color) {
    let center = 0;
    for (const [f, r] of CENTER_SQUARES) center += board.attackers(f, r, color).length;
    return center;
  }

  _materialDevHang(board, color, opp) {
    let mat = 0, dev = 0, hang_ct = 0, hang_val = 0;
    let kingSq = null;
    const home = MINOR_HOME[color];
    for (const [file, rank, piece] of board.pieces(color)) {
      mat += piece.value;
      if ((piece.type === 'n' || piece.type === 'b') && !home.has(file + ',' + rank)) dev++;
      if (piece.type === 'k') { kingSq = [file, rank]; continue; }
      const attackers = board.attackers(file, rank, opp);
      if (attackers.length) {
        const defenders = board.attackers(file, rank, color);
        const cheapest = Math.min(...attackers.map((t) => PIECE_VALUES[t]));
        if (defenders.length === 0 || cheapest < piece.value) { hang_ct++; hang_val += piece.value; }
      }
    }
    return { mat, dev, kingSq, hang_ct, hang_val };
  }

  _kingFeatures(board, color, opp, kingSq) {
    if (!kingSq) return { kp: 0, shield: 0, castled: 0 };
    const [kf, kr] = kingSq;

    let kp = 0;
    for (const [df, dr] of [[0, 0], ...KING_OFFSETS]) {
      const f = kf + df, r = kr + dr;
      if (Board.inBounds(f, r)) kp += board.attackers(f, r, opp).length;
    }

    let shield = 0;
    const front = color === 'w' ? [1, 2] : [-1, -2];
    for (const df of [-1, 0, 1]) {
      for (const dr of front) {
        const f = kf + df, r = kr + dr;
        if (Board.inBounds(f, r)) {
          const p = board.pieceAt(f, r);
          if (p && p.type === 'p' && p.color === color) shield++;
        }
      }
    }

    const castled = (kf + ',' + kr) !== KING_HOME[color] && (kf === 6 || kf === 2) ? 1 : 0;
    return { kp, shield, castled };
  }

  _centerOcc(board, color) {
    let occ = 0;
    for (const [f, r] of CENTER_SQUARES) {
      const p = board.pieceAt(f, r);
      if (p && p.color === color) occ++;
    }
    return occ;
  }

  _pawnStructure(board, color, opp) {
    const own = [];
    const byFile = new Map();
    for (const [f, r, p] of board.pieces(color)) {
      if (p.type !== 'p') continue;
      own.push([f, r]);
      if (!byFile.has(f)) byFile.set(f, []);
      byFile.get(f).push(r);
    }
    // Islands: runs of consecutive occupied files.
    let islands = 0;
    let prev = -2;
    for (const f of [...byFile.keys()].sort((a, b) => a - b)) {
      if (f !== prev + 1) islands++;
      prev = f;
    }
    // Isolated: no friendly pawn on an adjacent file.
    let isolated = 0;
    for (const [f] of own) if (!byFile.has(f - 1) && !byFile.has(f + 1)) isolated++;
    // Doubled: extra pawns sharing a file.
    let doubled = 0;
    for (const ranks of byFile.values()) if (ranks.length > 1) doubled += ranks.length - 1;
    // Passed: no enemy pawn ahead on the same or adjacent file.
    const enemyByFile = new Map();
    for (const [f, r, p] of board.pieces(opp)) {
      if (p.type !== 'p') continue;
      if (!enemyByFile.has(f)) enemyByFile.set(f, []);
      enemyByFile.get(f).push(r);
    }
    let passed = 0;
    for (const [f, r] of own) {
      let blocked = false;
      for (const nf of [f - 1, f, f + 1]) {
        for (const er of enemyByFile.get(nf) || []) {
          if (color === 'w' ? er > r : er < r) { blocked = true; break; }
        }
        if (blocked) break;
      }
      if (!blocked) passed++;
    }
    return { islands, isolated, doubled, passed };
  }

  _rookOpen(board, color) {
    const ownPawnFiles = new Set();
    const rookFiles = [];
    for (const [f, , p] of board.pieces(color)) {
      if (p.type === 'p') ownPawnFiles.add(f);
      else if (p.type === 'r') rookFiles.push(f);
    }
    return rookFiles.filter((f) => !ownPawnFiles.has(f)).length;
  }

  _mobility(board, color) {
    let total = 0;
    for (const [f, r] of board.pieces(color)) {
      for (const [tf, tr] of board.attacksFrom(f, r)) {
        const target = board.pieceAt(tf, tr);
        if (!target || target.color !== color) total++;
      }
    }
    return total;
  }

  _pieceMobility(board, file, rank, color) {
    let mob = 0;
    for (const [tf, tr] of board.attacksFrom(file, rank)) {
      const target = board.pieceAt(tf, tr);
      if (!target || target.color !== color) mob++;
    }
    return mob;
  }

  _outposts(board, color, opp) {
    const enemyPawns = [];
    for (const [f, r, p] of board.pieces(opp)) if (p.type === 'p') enemyPawns.push([f, r]);
    let count = 0;
    for (const [f, r, p] of board.pieces(color)) {
      if (p.type !== 'n') continue;
      const inEnemyHalf = color === 'w' ? r >= 4 : r <= 3;
      if (!inEnemyHalf) continue;
      if (!board.attackers(f, r, color).includes('p')) continue; // must be pawn-defended
      const assailable = enemyPawns.some(
        ([ef, er]) => (ef === f - 1 || ef === f + 1) && (color === 'w' ? er > r : er < r)
      );
      if (!assailable) count++;
    }
    return count;
  }

  _bishopQuality(board, color) {
    let total = 0;
    for (const [f, r, p] of board.pieces(color)) {
      if (p.type !== 'b') continue;
      const parity = (f + r) % 2;
      let pawnsOnComplex = 0;
      for (const [pf, pr, pp] of board.pieces(color)) {
        if (pp.type === 'p' && (pf + pr) % 2 === parity) pawnsOnComplex++;
      }
      total += this._pieceMobility(board, f, r, color) / (1 + pawnsOnComplex);
    }
    return total;
  }

  _coordination(board, color) {
    let count = 0;
    for (const [f, r, p] of board.pieces(color)) {
      if (p.type === 'k') continue;
      if (board.attackers(f, r, color).length) count++;
    }
    return count;
  }

  _colourComplex(board, color) {
    let light = 0;
    let dark = 0;
    for (const [f, r] of board.squares()) {
      if (board.isAttackedBy(f, r, color)) {
        if ((f + r) % 2 === 1) light++;
        else dark++;
      }
    }
    return light - dark;
  }
}

// Functional contract (CLAUDE.md §6) — thin wrappers over the OO engine.
const DEFAULT_ENGINE = new FeatureEngine();

/** @returns per-side features for `color`. */
export const sideFeats = (board, color) => DEFAULT_ENGINE.sideFeatures(board, color);
/** @returns {w, b, tension} for the board. */
export const features = (board) => DEFAULT_ENGINE.features(board);
/** Convenience: build from FEN and compute features. */
export const featuresFromFen = (fen) => DEFAULT_ENGINE.features(Board.fromFen(fen));
