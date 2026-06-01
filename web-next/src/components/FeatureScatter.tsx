import { useMemo, useState } from 'react';
import { Scatter } from 'react-chartjs-2';
import type { Profile } from '../types';
import { type SliceSel, availableFeatures, playersByScore, sliceValue } from '../lib/profile';

export function FeatureScatter({ p, sel }: { p: Profile; sel: SliceSel }) {
  const avail = useMemo(() => availableFeatures(p), [p]);
  const [x, setX] = useState(avail.includes('DYN.initiative') ? 'DYN.initiative' : avail[0]);
  const [y, setY] = useState(avail.includes('DEC.prophylaxis') ? 'DEC.prophylaxis' : avail[1] ?? avail[0]);

  const pts = useMemo(() => {
    const min = p.n_min;
    return playersByScore(p)
      .map(([name, d]) => ({ name, sx: sliceValue(d, x, sel), sy: sliceValue(d, y, sel) }))
      .filter((o) => o.sx.n >= min && o.sy.n >= min && Number.isFinite(o.sx.mean) && Number.isFinite(o.sy.mean))
      .map((o) => ({ x: o.sx.mean, y: o.sy.mean, name: o.name }));
  }, [p, sel, x, y]);

  const optEls = avail.map((id) => (
    <option key={id} value={id}>
      {p.meta[id]?.name ?? id}
    </option>
  ));
  const selCls = 'rounded-md border border-line bg-white px-1.5 py-0.5 text-xs';

  return (
    <section className="rounded-lg border border-line bg-white p-3.5">
      <h3 className="font-display text-base">Feature scatter</h3>
      <div className="my-1.5 flex flex-wrap gap-3 text-xs text-ink2">
        <label className="flex items-center gap-1">
          x
          <select className={selCls} value={x} onChange={(e) => setX(e.target.value)}>
            {optEls}
          </select>
        </label>
        <label className="flex items-center gap-1">
          y
          <select className={selCls} value={y} onChange={(e) => setY(e.target.value)}>
            {optEls}
          </select>
        </label>
      </div>
      <div className="relative h-[320px]">
        <Scatter
          data={{ datasets: [{ data: pts, backgroundColor: '#9A3B2E', pointRadius: 4 }] }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
              x: { title: { display: true, text: p.meta[x]?.name ?? x } },
              y: { title: { display: true, text: p.meta[y]?.name ?? y } },
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (c: { raw: unknown }) => {
                    const r = c.raw as { name: string; x: number; y: number };
                    return `${r.name}: ${r.x}, ${r.y}`;
                  },
                },
              },
            },
          }}
        />
      </div>
    </section>
  );
}
