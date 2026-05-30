import { useState } from 'react';
import type { Profile } from '../types';
import { type Mover, type SliceSel, PHASE_LABEL, topMovers } from '../lib/profile';
import { CorrelationChart } from './CorrelationChart';

function MoverRow({ m, maxR }: { m: Mover; maxR: number }) {
  const pos = m.r >= 0;
  const color = pos ? 'var(--color-good)' : 'var(--color-w)';
  return (
    <div className="flex items-center gap-2 py-[3px] text-xs">
      <span className="w-28 shrink-0 truncate" title={m.name}>
        {m.name}
      </span>
      <span className="relative h-2 flex-1 rounded-sm bg-paper2">
        <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
        <span
          className="absolute inset-y-0 rounded-sm"
          style={
            pos
              ? { left: '50%', width: `${(Math.abs(m.r) / maxR) * 50}%`, background: color }
              : { right: '50%', width: `${(Math.abs(m.r) / maxR) * 50}%`, background: color }
          }
        />
      </span>
      <span className="w-9 shrink-0 text-right tabular-nums" style={{ color }}>
        {(pos ? '+' : '') + m.r.toFixed(2)}
      </span>
    </div>
  );
}

export function WinningDNA({ p, phase }: { p: Profile; phase: SliceSel['phase'] }) {
  const [open, setOpen] = useState(false);
  const { up, down } = topMovers(p, phase, 6);
  const maxR = Math.max(0.01, ...[...up, ...down].map((m) => Math.abs(m.r)));

  return (
    <section className="rounded-lg border border-line bg-white p-3">
      <h3 className="font-display text-base">Winning DNA</h3>
      <p className="mb-2 text-[11px] text-ink2">
        What separated winners {phase === 'all' ? 'across the game' : `in the ${PHASE_LABEL[phase].toLowerCase()}`} —
        each feature’s correlation with the result.
      </p>

      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-good">Tracks winning ↑</div>
      {up.length ? up.map((m) => <MoverRow key={m.id} m={m} maxR={maxR} />) : <p className="text-xs text-ink2">—</p>}

      <div className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wide text-w">Tracks losing ↓</div>
      {down.length ? down.map((m) => <MoverRow key={m.id} m={m} maxR={maxR} />) : <p className="text-xs text-ink2">—</p>}

      <button
        type="button"
        className="mt-3 text-[11px] text-ink2 underline underline-offset-2 hover:text-ink"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Hide full chart' : 'Show all features'}
      </button>
      {open && (
        <div className="mt-2">
          <CorrelationChart p={p} phase={phase} />
        </div>
      )}
      <p className="mt-2 text-[10px] leading-snug text-ink2">
        Pooled across players — a field-level signal, not proof of cause.
      </p>
    </section>
  );
}
