import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import type { ManifestEntry, PlyIndex } from '../../engine/game';

type Meta = Record<string, ManifestEntry>;

/** Trend of the selected feature for both sides across the plies played so far. */
export function TrendChart({
  plyIndex,
  meta,
  selectedId,
  upto,
}: {
  plyIndex: PlyIndex[];
  meta: Meta;
  selectedId: string;
  upto: number;
}) {
  const { labels, datasets } = useMemo(() => {
    const labels = Array.from({ length: upto + 1 }, (_, i) => i);
    const val = (i: number, side: string) => {
      const r = plyIndex[i]?.[selectedId]?.[side];
      return r ? r.value : null;
    };
    const shared = plyIndex[0]?.[selectedId]?.shared !== undefined;
    const name = meta[selectedId]?.name ?? selectedId;
    if (shared) {
      return {
        labels,
        datasets: [
          { label: name, data: labels.map((i) => val(i, 'shared')), borderColor: '#5C5345', backgroundColor: '#5C5345', borderWidth: 2, pointRadius: 0, tension: 0.25 },
        ],
      };
    }
    return {
      labels,
      datasets: [
        { label: 'White', data: labels.map((i) => val(i, 'w')), borderColor: '#9A3B2E', backgroundColor: '#9A3B2E', borderWidth: 2, pointRadius: 0, tension: 0.25 },
        { label: 'Black', data: labels.map((i) => val(i, 'b')), borderColor: '#1F5673', backgroundColor: '#1F5673', borderWidth: 2, borderDash: [5, 4], pointRadius: 0, tension: 0.25 },
      ],
    };
  }, [plyIndex, meta, selectedId, upto]);

  return (
    <Line
      data={{ labels, datasets }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: 'ply' }, grid: { display: false }, ticks: { maxTicksLimit: 10 } },
          y: { beginAtZero: true, grid: { color: '#e3dccb' } },
        },
      }}
    />
  );
}
