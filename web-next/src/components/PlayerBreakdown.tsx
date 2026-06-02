import { useMemo } from 'react';
import type { GameRow, Profile } from '../types';
import { type SliceSel, PHASE_LABEL, cellColor, goodness } from '../lib/profile';
import type { Metric, Range } from '../lib/metrics';

const fmt = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '–' : Number.isInteger(v) ? String(v) : (Math.round(v * 100) / 100).toFixed(2);
const WDL = (s: number) => (s === 1 ? 'W' : s === 0.5 ? 'D' : 'L');

/** One player's games (in round order) × the SAME metric columns as the matrix above,
 *  with a Mean row that reconciles with the matrix. Cells are coloured red→green against
 *  the field range. Serves both the feature and trait breakdowns. */
export function PlayerBreakdown({
  p,
  player,
  title,
  metrics,
  ranges,
  sel,
  onClose,
  onOpenGame,
}: {
  p: Profile;
  player: string;
  title: string; // e.g. "per-game breakdown" or "games by trait"
  metrics: Metric[];
  ranges: Map<string, Range>;
  sel: SliceSel;
  onClose: () => void;
  onOpenGame?: (id: string) => void;
}) {
  const d = p.players[player];
  const rows = useMemo(() => {
    if (!d) return [] as GameRow[];
    const r = sel.color === 'all' ? d.game_rows : d.game_rows.filter((g) => g.color === sel.color);
    return [...r].sort((a, b) => a.round - b.round);
  }, [d, sel.color]);

  if (!d) return null;

  const mean = (m: Metric): number | null => {
    const xs = rows.map((r) => m.game(r)).filter((v): v is number => v != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const colourNote = sel.color === 'all' ? '' : sel.color === 'w' ? ' · White games only' : ' · Black games only';
  const hasPhaseData = sel.phase !== 'all' && rows.some((r) => r.phase_vals);
  const phaseNote =
    sel.phase === 'all' ? '' : hasPhaseData ? ` · ${PHASE_LABEL[sel.phase]} only` : ' (whole-game values — no per-phase data for this tournament)';

  const Cell = ({ m, v }: { m: Metric; v: number | null }) => {
    const rg = ranges.get(m.id);
    const g = v == null || !rg ? null : goodness(v, rg.lo, rg.hi, m.higher);
    return (
      <td className="whitespace-nowrap px-2 py-0.5 text-right tabular-nums" style={g == null ? undefined : { background: cellColor(g) }}>
        {fmt(v)}
      </td>
    );
  };

  return (
    <section className="mt-3 rounded-lg border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div>
          <h3 className="font-display text-base">
            {player} <span className="text-xs font-normal text-ink2">— {title}{colourNote}</span>
          </h3>
          <p className="text-[11px] text-ink2">
            {rows.length} games, by round · the <b>Mean</b> row equals this player’s value in the matrix above{phaseNote}.
            Click a game to open it.
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
              {metrics.map((m) => (
                <th key={m.id} className="whitespace-nowrap border-b border-line bg-paper2 px-2 py-1.5 text-right font-semibold text-ink2" title={m.desc}>
                  {m.label}
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
                {metrics.map((m) => (
                  <Cell key={m.id} m={m} v={m.game(r)} />
                ))}
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="sticky left-0 z-10 border-t border-line bg-paper2 px-2 py-1 text-left">Mean</td>
              {metrics.map((m) => (
                <td key={m.id} className="border-t border-line bg-paper2 px-2 py-1 text-right tabular-nums">
                  {fmt(mean(m))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
