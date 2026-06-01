import { useMemo } from 'react';
import { Radar } from 'react-chartjs-2';
import type { Profile } from '../types';
import {
  type SliceSel,
  PALETTE,
  availableFeatures,
  clusters,
  columnRange,
  goodness,
  playersByScore,
  sliceValue,
} from '../lib/profile';

const radarOpts = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false as const,
  scales: { r: { min: 0, max: 1, ticks: { display: false }, pointLabels: { font: { size: 9 } } } },
  plugins: { legend: { display: false } },
};

export function PlayerRadar({
  p,
  sel,
  selected,
  onToggle,
}: {
  p: Profile;
  sel: SliceSel;
  selected: Set<string>;
  onToggle: (name: string) => void;
}) {
  const groups = useMemo(() => clusters(p), [p]);
  const ranges = useMemo(
    () => Object.fromEntries(availableFeatures(p).map((id) => [id, columnRange(p, id, sel, p.n_min)])),
    [p, sel],
  );
  const plotted = playersByScore(p)
    .map(([n]) => n)
    .filter((n) => selected.has(n));

  const g = (id: string, name: string) => {
    const v = sliceValue(p.players[name], id, sel).mean;
    const r = ranges[id];
    const val = goodness(v, r.lo, r.hi, p.meta[id]?.higher ?? 'neutral');
    return val == null ? 0.5 : Math.round(val * 100) / 100;
  };

  return (
    <section className="rounded-lg border border-line bg-white p-3.5">
      <h3 className="font-display text-base">Player radar</h3>
      <p className="mb-2 text-xs text-ink2">
        Outward = better; all features grouped into clusters. Pick any players — the list scrolls.
      </p>
      <div className="mb-2 max-h-[70vh] overflow-auto rounded-md border border-line/60 p-2">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-3 gap-y-1">
          {playersByScore(p).map(([name]) => {
            const on = selected.has(name);
            const idx = plotted.indexOf(name);
            return (
              <label key={name} className="flex items-center gap-1.5 truncate text-[11px] text-ink2" title={name}>
                <input type="checkbox" checked={on} onChange={() => onToggle(name)} />
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: idx >= 0 ? PALETTE[idx % PALETTE.length] : 'transparent', outline: idx >= 0 ? 'none' : '1px solid var(--color-line)' }}
                />
                <span className="truncate">{name}</span>
              </label>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        {groups.map((cl, ci) => {
          const datasets = plotted.map((name, i) => {
            const color = PALETTE[i % PALETTE.length];
            return {
              label: name,
              data: cl.ids.map((id) => g(id, name)),
              borderColor: color,
              backgroundColor: color + '22',
              borderWidth: 1.5,
              pointRadius: 2,
            };
          });
          return (
            <div key={ci}>
              <div className="mb-0.5 text-center text-[11.5px] font-semibold text-ink2">{cl.title}</div>
              <div className="relative h-[230px]">
                <Radar data={{ labels: cl.ids.map((id) => p.meta[id]?.name ?? id), datasets }} options={radarOpts} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
