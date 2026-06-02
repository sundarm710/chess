import { useMemo, useState } from 'react';
import type { Profile } from '../types';
import { type Mover, type SliceSel, PHASE_LABEL, topMovers } from '../lib/profile';
import { type TraitTable, traitResultCorr } from '../lib/traits';
import { CorrelationChart } from './CorrelationChart';

function MoverRow({ name, r, maxR }: { name: string; r: number; maxR: number }) {
  const pos = r >= 0;
  const color = pos ? 'var(--color-good)' : 'var(--color-w)';
  return (
    <div className="flex items-center gap-2 py-[3px] text-xs">
      <span className="w-28 shrink-0 truncate" title={name}>{name}</span>
      <span className="relative h-2 flex-1 rounded-sm bg-paper2">
        <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
        <span
          className="absolute inset-y-0 rounded-sm"
          style={pos ? { left: '50%', width: `${(Math.abs(r) / maxR) * 50}%`, background: color } : { right: '50%', width: `${(Math.abs(r) / maxR) * 50}%`, background: color }}
        />
      </span>
      <span className="w-9 shrink-0 text-right tabular-nums" style={{ color }}>{(pos ? '+' : '') + r.toFixed(2)}</span>
    </div>
  );
}

type Mode = 'features' | 'traits';

export function WinningDNA({ p, sel, table }: { p: Profile; sel: SliceSel; table: TraitTable }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('traits');

  const traitMovers = useMemo(() => traitResultCorr(p, sel, table), [p, sel, table]);
  const { up, down } = useMemo<{ up: { name: string; r: number }[]; down: { name: string; r: number }[] }>(() => {
    if (mode === 'features') {
      const m = topMovers(p, sel.phase, 6);
      const conv = (xs: Mover[]) => xs.map((x) => ({ name: x.name, r: x.r }));
      return { up: conv(m.up), down: conv(m.down) };
    }
    const sorted = [...traitMovers].sort((a, b) => b.r - a.r);
    return {
      up: sorted.filter((m) => m.r > 0).map((m) => ({ name: m.label, r: m.r })),
      down: sorted.filter((m) => m.r < 0).reverse().map((m) => ({ name: m.label, r: m.r })),
    };
  }, [mode, p, sel.phase, traitMovers]);

  const maxR = Math.max(0.01, ...[...up, ...down].map((m) => Math.abs(m.r)));
  const where = sel.phase === 'all' ? 'across the game' : `in the ${PHASE_LABEL[sel.phase].toLowerCase()}`;

  return (
    <section className="rounded-lg border border-line bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-base">Winning DNA</h3>
        <div className="inline-flex overflow-hidden rounded-md border border-line text-[11px]">
          {(['traits', 'features'] as Mode[]).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`px-2 py-0.5 ${mode === m ? 'bg-ink text-paper' : 'bg-paper2 text-ink2'}`}>
              {m === 'traits' ? 'Temperaments' : 'Features'}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-2 mt-1 text-[11px] text-ink2">
        What separated winners {where} — each {mode === 'traits' ? 'temperament’s' : 'feature’s'} correlation with the result.
      </p>

      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-good">Tracks winning ↑</div>
      {up.length ? up.map((m) => <MoverRow key={m.name} name={m.name} r={m.r} maxR={maxR} />) : <p className="text-xs text-ink2">—</p>}

      <div className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wide text-w">Tracks losing ↓</div>
      {down.length ? down.map((m) => <MoverRow key={m.name} name={m.name} r={m.r} maxR={maxR} />) : <p className="text-xs text-ink2">—</p>}

      {mode === 'features' && (
        <>
          <button type="button" className="mt-3 text-[11px] text-ink2 underline underline-offset-2 hover:text-ink" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide full chart' : 'Show all features'}
          </button>
          {open && (
            <div className="mt-2">
              <CorrelationChart p={p} phase={sel.phase} />
            </div>
          )}
        </>
      )}
      <p className="mt-2 text-[10px] leading-snug text-ink2">Pooled across players — a field-level signal, not proof of cause.</p>
    </section>
  );
}
