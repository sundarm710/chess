import type { Metric } from '../lib/metrics';

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : (Math.round(v * 100) / 100).toFixed(2));

/** The right-hand ranking panel: players sorted by the focused column (feature OR trait
 *  roll-up), best first, as a bar chart. Driven by whichever column was last clicked in
 *  the matrix to its left — the table itself never re-sorts. */
export function FocusPanel({ metric, names, nMin }: { metric: Metric | null; names: string[]; nMin: number }) {
  if (!metric) return null;
  const rows = names
    .map((name) => ({ name, cell: metric.player(name) }))
    .filter((r): r is { name: string; cell: { mean: number; n: number } } => r.cell != null)
    .map((r) => ({ name: r.name, mean: r.cell.mean, n: r.cell.n }));
  const asc = metric.higher === 'bad'; // lower-is-better → smallest on top
  rows.sort((a, b) => Number(a.n < nMin) - Number(b.n < nMin) || (asc ? a.mean - b.mean : b.mean - a.mean));
  const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.mean)));
  const dir = metric.higher === 'good' ? 'higher is better' : metric.higher === 'bad' ? 'lower is better' : 'more = greener';

  return (
    <section className="rounded-lg border border-line bg-white p-3">
      <h3 className="font-display text-base">{metric.label}</h3>
      <p className="text-[11px] text-ink2">{dir} · {rows.length} players, ranked</p>
      {metric.desc && <p className="my-1.5 text-xs leading-snug text-ink2">{metric.desc}</p>}
      <div className="mt-1 max-h-[68vh] overflow-auto pr-1">
        {rows.map((r, i) => (
          <div key={r.name} className={'flex items-center gap-2 py-[3px] text-xs ' + (r.n < nMin ? 'opacity-40' : '')}>
            <span className="w-4 shrink-0 text-right tabular-nums text-ink2">{i + 1}</span>
            <span className="w-28 shrink-0 truncate" title={r.name}>{r.name}</span>
            <span className="h-2 flex-1 rounded-sm bg-paper2">
              <span className="block h-full rounded-sm bg-b" style={{ width: `${Math.max(3, (Math.abs(r.mean) / max) * 100)}%` }} />
            </span>
            <span className="w-10 shrink-0 text-right tabular-nums">{fmt(r.mean)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
