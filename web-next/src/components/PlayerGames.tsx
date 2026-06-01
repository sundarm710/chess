import { useMemo } from 'react';
import type { Profile } from '../types';
import { type SliceSel, availableFeatures, cellColor, columnRange, goodness, PHASE_LABEL } from '../lib/profile';

const fmt = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '–' : Number.isInteger(v) ? String(v) : (Math.round(v * 100) / 100).toFixed(2);
const WDL = (s: number) => (s === 1 ? 'W' : s === 0.5 ? 'D' : 'L');

/** Per-game breakdown for one player: games as rows, every feature as a column,
 *  with a Mean row that reconciles with the matrix value above. */
export function PlayerGames({
  p,
  player,
  sel,
  onClose,
  onOpenGame,
}: {
  p: Profile;
  player: string;
  sel: SliceSel;
  onClose: () => void;
  onOpenGame?: (id: string) => void;
}) {
  const d = p.players[player];
  const feats = useMemo(() => availableFeatures(p), [p]);
  const ranges = useMemo(
    () => Object.fromEntries(feats.map((id) => [id, columnRange(p, id, { phase: 'all', color: 'all' }, p.n_min)])),
    [p, feats],
  );
  if (!d) return null;

  const rows = sel.color === 'all' ? d.game_rows : d.game_rows.filter((r) => r.color === sel.color);
  const mean = (fid: string) => {
    const xs = rows.map((r) => r.vals[fid]).filter((v) => v != null) as number[];
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };

  const colourNote = sel.color === 'all' ? '' : sel.color === 'w' ? ' · White games only' : ' · Black games only';
  const phaseNote = sel.phase !== 'all' ? ` (per-game values are whole-game; the matrix above is sliced to ${PHASE_LABEL[sel.phase]})` : '';

  const Cell = ({ fid, v }: { fid: string; v: number | null | undefined }) => {
    const g = v == null ? null : goodness(v, ranges[fid].lo, ranges[fid].hi, p.meta[fid]?.higher ?? 'neutral');
    return (
      <td className="whitespace-nowrap px-2 py-0.5 text-right tabular-nums" style={g == null ? undefined : { background: cellColor(g) }}>
        {fmt(v)}
      </td>
    );
  };

  return (
    <section className="mt-5 rounded-lg border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div>
          <h3 className="font-display text-base">
            {player} <span className="text-xs font-normal text-ink2">— per-game breakdown{colourNote}</span>
          </h3>
          <p className="text-[11px] text-ink2">
            {rows.length} games · the <b>Mean</b> row equals this player’s value in the matrix above{phaseNote}. Click a
            game to open it in the stepper.
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md border border-line px-2 py-0.5 text-xs text-ink2 hover:bg-paper2">
          Close ✕
        </button>
      </div>
      <div className="max-h-[52vh] overflow-auto">
        <table className="border-collapse text-xs">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="sticky left-0 z-30 border-b border-line bg-paper2 px-2 py-1.5 text-left font-semibold text-ink2">Game</th>
              {feats.map((id) => (
                <th key={id} className="whitespace-nowrap border-b border-line bg-paper2 px-2 py-1.5 text-right font-semibold text-ink2" title={p.meta[id]?.description ?? ''}>
                  {p.meta[id]?.name ?? id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => onOpenGame?.(r.id)}
                className={onOpenGame ? 'cursor-pointer hover:bg-paper/60' : 'hover:bg-paper/60'}
                title={onOpenGame ? 'Open this game in the stepper' : undefined}
              >
                <td className="sticky left-0 z-10 whitespace-nowrap border-b border-line/60 bg-white px-2 py-0.5">
                  <span className="text-ink2">R{r.round}</span>{' '}
                  <span className={r.color === 'w' ? 'text-w' : 'text-b'}>{r.color === 'w' ? '□' : '■'}</span>{' '}
                  <span className={onOpenGame ? 'underline decoration-dotted underline-offset-2' : ''}>{r.opp}</span>{' '}
                  <span className="text-ink2">· {WDL(r.score)}</span>
                </td>
                {feats.map((id) => (
                  <Cell key={id} fid={id} v={r.vals[id]} />
                ))}
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="sticky left-0 z-10 border-t border-line bg-paper2 px-2 py-1 text-left">Mean</td>
              {feats.map((id) => (
                <td key={id} className="border-t border-line bg-paper2 px-2 py-1 text-right tabular-nums">
                  {fmt(mean(id))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
