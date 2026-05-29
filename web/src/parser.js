// PGN tokenizer + chess.js move application (CLAUDE.md §7).
//
// Our own tokenizer; chess.js is used ONLY to apply legal moves and emit FENs —
// never for features. Hard-won gotchas (do NOT use load_pgn; strip headers /
// comments / variations / NAGs / results / move numbers; sloppy move() with a
// disambiguation fallback) are all encoded here.
//
// OO: a `PgnParser` holds the injected chess.js constructor (testable, no hidden
// globals). `extractSans` is exported standalone because its tokenization is pure
// string logic — unit-tested in node without chess.js (web/test/parser.test.mjs).

const RESULT = /(?:1-0|0-1|1\/2-1\/2|\*)/g;
const SAN_FALLBACK = /^([KQRBN]?)([a-h]?)([1-8]?)x?([a-h][1-8])(?:=([QRBN]))?$/;

/**
 * Reduce raw PGN movetext to an ordered list of SAN tokens.
 * Strips headers, {comments}, ;comments, (variations), $NAGs, results (incl. a
 * bare `*`), move numbers, and trailing +/#/!/? marks; normalizes 0-0 -> O-O.
 * @param {string} pgn
 * @returns {string[]}
 */
export function extractSans(pgn) {
  const t = pgn
    .replace(/\[[^\]]*\]/g, ' ')        // headers
    .replace(/\{[^}]*\}/g, ' ')         // {comments}
    .replace(/;[^\n]*/g, ' ')           // ; comments
    .replace(/\([^)]*\)/g, ' ')         // (variations)
    .replace(/\$\d+/g, ' ')             // $NAGs
    .replace(RESULT, ' ')               // results (incl. bare *)
    .replace(/[0Oo]-[0Oo]-[0Oo]/g, 'O-O-O') // normalize long castling
    .replace(/[0Oo]-[0Oo]/g, 'O-O')         // normalize short castling
    .replace(/\d+\.+/g, ' ');           // move numbers "12." / "12..."
  return t
    .split(/\s+/)
    .map((x) => x.replace(/[!?]+$/, '').replace(/[+#]+$/, '')) // annotations & check marks
    .filter((x) => x && x !== '*' && !/^\d+$/.test(x));
}

/** Parses PGN movetext into applied moves + the FEN after each ply. */
export class PgnParser {
  /**
   * @param {Function} [ChessCtor] chess.js constructor; defaults to the global `Chess`
   *   loaded from the CDN. Injectable so the move-application path can be tested.
   */
  constructor(ChessCtor) {
    this.ChessCtor = ChessCtor || (typeof globalThis !== 'undefined' ? globalThis.Chess : undefined);
    if (!this.ChessCtor) throw new Error('chess.js (global Chess) is not available');
  }

  /**
   * @param {string} pgn
   * @returns {{moves: object[], fens: string[]}} one FEN per position (start + after each ply).
   * @throws if no moves are found or a token cannot be applied.
   */
  parse(pgn) {
    const sans = extractSans(pgn);
    if (!sans.length) throw new Error('No moves found in this PGN.');
    const c = new this.ChessCtor();
    const fens = [c.fen()];
    const moves = [];
    for (const tok of sans) {
      let mv = c.move(tok, { sloppy: true });
      if (!mv) mv = this._applyFallback(c, tok); // odd / over-disambiguated SAN
      if (!mv) throw new Error('Could not read move "' + tok + '" — check the PGN around there.');
      moves.push(mv);
      fens.push(c.fen());
    }
    return { moves, fens };
  }

  /**
   * Fallback for SAN that 0.10.3's move() rejects (e.g. over-disambiguated `Ngf3`):
   * match against legal verbose moves by piece + destination, honoring any
   * file/rank/promotion hint, accepting only a unique candidate.
   */
  _applyFallback(c, tok) {
    const m = tok.match(SAN_FALLBACK);
    if (!m) return null;
    const [, pieceLetter, ff, rr, dest, promo] = m;
    const piece = (pieceLetter || 'P').toLowerCase();
    const cands = c.moves({ verbose: true }).filter(
      (x) =>
        x.to === dest &&
        x.piece === piece &&
        (!ff || x.from[0] === ff) &&
        (!rr || x.from[1] === rr) &&
        (!promo || (x.promotion && x.promotion.toUpperCase() === promo))
    );
    return cands.length === 1 ? c.move(cands[0].san, { sloppy: true }) : null;
  }
}
