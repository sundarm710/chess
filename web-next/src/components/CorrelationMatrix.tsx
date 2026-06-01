import { useMemo } from 'react';
import type { Profile } from '../types';

// r ∈ [-1,1] → red (anti-correlated) … yellow (0) … green (correlated). null → blank.
function corrColor(r: number | null): string | undefined {
  if (r == null) return undefined;
  const hue = ((r + 1) / 2) * 120;
  return `hsl(${hue}, 60%, ${82 - Math.abs(r) * 10}%)`;
}

export function CorrelationMatrix({ p }: { p: Profile }) {
  const { features, r } = p.feature_correlation;
  const short = useMemo(
    () => features.map((id) => (p.meta[id]?.name ?? id)),
    [features, p.meta],
  );
  const k = features.length;

  return (
    <section className="rounded-lg border border-line bg-white p-3">
      <h3 className="font-display text-base">Feature correlations</h3>
      <p className="mb-2 text-[11px] text-ink2">
        How features co-move across all games (Pearson r). <span className="text-good">Green</span> = move together,{' '}
        <span className="text-w">red</span> = move opposite. Hover a cell for the pair.
      </p>
      <div className="overflow-auto">
        <div
          className="grid w-max"
          style={{ gridTemplateColumns: `minmax(96px,auto) repeat(${k}, 14px)` }}
        >
          {short.map((rowName, i) => (
            <div key={i} className="contents">
              <div className="truncate border-b border-line/40 pr-1 text-right text-[10px] leading-[14px] text-ink2" title={rowName}>
                {rowName}
              </div>
              {r[i].map((v, j) => (
                <div
                  key={j}
                  className="h-[14px] w-[14px] border-b border-r border-white/40"
                  style={{ background: corrColor(v) }}
                  title={`${rowName} × ${short[j]}: ${v == null ? 'n/a' : v.toFixed(2)}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
