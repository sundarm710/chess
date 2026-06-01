import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import type { Profile } from '../types';
import { type SliceSel, PHASE_LABEL, availableFeatures } from '../lib/profile';

// Chart.js pieces are registered centrally in lib/chartSetup.
// react-chartjs-2 manages the canvas lifecycle — no manual destroy()/recreate.

export function CorrelationChart({ p, phase }: { p: Profile; phase: SliceSel['phase'] }) {
  const rows = useMemo(() => {
    const out: [string, number][] = [];
    for (const id of availableFeatures(p)) {
      const rc = p.result_correlation[id];
      if (!rc) continue;
      const r = phase === 'all' ? rc.r : rc.phases?.[phase]?.r;
      if (r == null) continue;
      out.push([p.meta[id]?.name ?? id, r]);
    }
    return out.sort((a, b) => b[1] - a[1]);
  }, [p, phase]);

  const data = {
    labels: rows.map(([name]) => name),
    datasets: [
      {
        data: rows.map(([, r]) => Math.round(r * 1000) / 1000),
        backgroundColor: rows.map(([, r]) => (r >= 0 ? '#0F6E56' : '#9A3B2E')),
      },
    ],
  };

  return (
    <div style={{ height: Math.max(160, rows.length * 16 + 46) }}>
      <Bar
        data={data}
        options={{
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          scales: {
            x: {
              min: -1,
              max: 1,
              title: {
                display: true,
                text: `Pearson r with result${phase === 'all' ? '' : ' · ' + PHASE_LABEL[phase]}`,
              },
            },
            y: { ticks: { font: { size: 9 } } },
          },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => `r = ${c.raw}` } },
          },
        }}
      />
    </div>
  );
}
