import { useMemo, useState } from 'react';
import type { Profile } from '../types';
import type { SliceSel } from '../lib/profile';
import { type TraitTable, traitCorrMatrix } from '../lib/traits';

// r ∈ [-1,1] → red (anti-correlated) … yellow (0) … green (correlated). null → blank.
function corrColor(r: number | null): string | undefined {
  if (r == null) return undefined;
  const hue = ((r + 1) / 2) * 120;
  return `hsl(${hue}, 60%, ${82 - Math.abs(r) * 10}%)`;
}

type Mode = 'features' | 'traits';

export function CorrelationMatrix({ p, sel, table }: { p: Profile; sel: SliceSel; table: TraitTable }) {
  const [mode, setMode] = useState<Mode>('traits');
  const traitCorr = useMemo(() => traitCorrMatrix(p, sel, table), [p, sel, table]);

  const labels = mode === 'features' ? p.feature_correlation.features.map((id) => p.meta[id]?.name ?? id) : traitCorr.traits.map((t) => t.label);
  const r = mode === 'features' ? p.feature_correlation.r : traitCorr.r;
  const k = labels.length;
  const cell = mode === 'features' ? 14 : 30; // traits are few → bigger, labelled cells

  return (
    <section className="rounded-lg border border-line bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-base">{mode === 'traits' ? 'Temperament' : 'Feature'} correlations</h3>
        <div className="inline-flex overflow-hidden rounded-md border border-line text-[11px]">
          {(['traits', 'features'] as Mode[]).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`px-2 py-0.5 ${mode === m ? 'bg-ink text-paper' : 'bg-paper2 text-ink2'}`}>
              {m === 'traits' ? 'Temperaments' : 'Features'}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-2 mt-1 text-[11px] text-ink2">
        How {mode === 'traits' ? 'temperaments' : 'features'} co-move across all games (Pearson r).{' '}
        <span className="text-good">Green</span> = together, <span className="text-w">red</span> = opposite.
      </p>
      <div className="overflow-auto">
        <div className="grid w-max" style={{ gridTemplateColumns: `minmax(96px,auto) repeat(${k}, ${cell}px)` }}>
          {labels.map((rowName, i) => (
            <div key={i} className="contents">
              <div className="sticky left-0 z-10 truncate border-b border-line/40 bg-white pr-1 text-right text-[10px] text-ink2" style={{ lineHeight: `${cell}px` }} title={rowName}>
                {rowName}
              </div>
              {r[i].map((v, j) => (
                <div
                  key={j}
                  className="flex items-center justify-center border-b border-r border-white/40 text-[8px] tabular-nums text-ink/70"
                  style={{ height: cell, width: cell, background: corrColor(v) }}
                  title={`${rowName} × ${labels[j]}: ${v == null ? 'n/a' : v.toFixed(2)}`}
                >
                  {mode === 'traits' && v != null && i !== j ? v.toFixed(1).replace('0.', '.') : ''}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
