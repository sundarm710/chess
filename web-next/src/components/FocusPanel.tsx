import type { Profile } from '../types';
import { type SliceSel, rankedEntries } from '../lib/profile';

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : (Math.round(v * 100) / 100).toFixed(2));

export function FocusPanel({ p, fid, sel }: { p: Profile; fid: string | null; sel: SliceSel }) {
  if (!fid) return null;
  const m = p.meta[fid];
  const rows = rankedEntries(p, fid, sel, p.n_min).slice(0, 8);
  const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.mean)));
  const dir = m?.higher === 'good' ? 'higher is better' : m?.higher === 'bad' ? 'lower is better' : 'neutral';

  return (
    <section className="rounded-lg border border-line bg-white p-3">
      <h3 className="font-display text-base">{m?.name ?? fid}</h3>
      <p className="text-[11px] text-ink2">{dir} · top players</p>
      {m?.description && <p className="my-1.5 text-xs leading-snug text-ink2">{m.description}</p>}
      <div className="mt-1">
        {rows.map((r, i) => (
          <div
            key={r.name}
            className={'flex items-center gap-2 py-[3px] text-xs ' + (r.n < p.n_min ? 'opacity-40' : '')}
          >
            <span className="w-4 shrink-0 text-right tabular-nums text-ink2">{i + 1}</span>
            <span className="w-28 shrink-0 truncate" title={r.name}>
              {r.name}
            </span>
            <span className="h-2 flex-1 rounded-sm bg-paper2">
              <span
                className="block h-full rounded-sm bg-b"
                style={{ width: `${Math.max(3, (Math.abs(r.mean) / max) * 100)}%` }}
              />
            </span>
            <span className="w-10 shrink-0 text-right tabular-nums">{fmt(r.mean)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
