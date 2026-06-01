import type { NormMove } from '../../engine/game';
import { highlightsFor } from '../../engine/highlights.js';
import { PIECE_SVG as PIECE_SVG_RAW } from '../../engine/pieces.js';

const PIECE_SVG = PIECE_SVG_RAW as Record<string, string>;

const FX: Record<string, string> = {
  bad: 'rgba(154,59,46,0.40)',
  good: 'rgba(15,110,86,0.38)',
  neutral: 'rgba(31,86,115,0.32)',
};

/** 8×8 board with the move just played highlighted and the selected feature's
 *  evidence squares lit (red = under attack, green = protective, blue = info). */
export function Board({ board, move, selectedId }: { board: any; move: NormMove | null; selectedId: string }) {
  const hl = highlightsFor(board, selectedId);
  const hlSet = new Set<string>(hl.squares);
  const cells = [];
  for (let ri = 0; ri < 8; ri++) {
    const rank = 7 - ri;
    for (let ci = 0; ci < 8; ci++) {
      const file = ci;
      const sqName = 'abcdefgh'[file] + (rank + 1);
      const dark = (file + rank) % 2 === 0;
      const p = board.pieceAt(file, rank);
      const isMove = !!move && (sqName === move.from || sqName === move.to);
      const fx = hlSet.has(sqName) ? FX[hl.kind] : null;
      cells.push(
        <div
          key={sqName}
          className="relative flex items-center justify-center"
          style={{ background: dark ? 'var(--color-dsq)' : 'var(--color-lsq)' }}
        >
          {isMove && <span className="absolute inset-0" style={{ background: 'rgba(180,130,40,0.38)' }} />}
          {fx && <span className="absolute inset-0" style={{ background: fx }} />}
          {p && (
            <span
              className="relative z-10 block h-[82%] w-[82%]"
              dangerouslySetInnerHTML={{ __html: PIECE_SVG[p.color + p.type] }}
            />
          )}
        </div>,
      );
    }
  }
  return (
    <div
      className="grid aspect-square w-full overflow-hidden rounded-md border border-line"
      style={{ gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)' }}
    >
      {cells}
    </div>
  );
}
