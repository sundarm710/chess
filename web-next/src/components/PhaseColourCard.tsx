import { useMemo, useState } from 'react';
import { Line, Radar } from 'react-chartjs-2';
import type { Profile } from '../types';
import {
  type SliceSel,
  PALETTE,
  PHASES,
  PHASE_LABEL,
  availableFeatures,
  cellColor,
  clusters,
  columnRange,
  goodness,
  playersByScore,
  sliceValue,
} from '../lib/profile';

type View = 'trajectory' | 'fingerprint' | 'wvb';
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : (Math.round(v * 100) / 100).toFixed(2));

export function PhaseColourCard({
  p,
  sel,
  focused,
  selected,
}: {
  p: Profile;
  sel: SliceSel;
  focused: string | null;
  selected: Set<string>;
}) {
  const [view, setView] = useState<View>('trajectory');
  const [fpPlayer, setFpPlayer] = useState(playersByScore(p)[0]?.[0] ?? '');
  const feats = useMemo(() => availableFeatures(p), [p]);
  const allRanges = useMemo(
    () => Object.fromEntries(feats.map((id) => [id, columnRange(p, id, { phase: 'all', color: 'all' }, p.n_min)])),
    [p, feats],
  );

  const tabs: [View, string][] = [
    ['trajectory', 'Phase trajectory'],
    ['fingerprint', 'Phase fingerprint'],
    ['wvb', 'White vs Black'],
  ];

  return (
    <section className="rounded-lg border border-line bg-white p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base">Phase &amp; colour</h3>
        <div className="flex items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-md border border-line">
            {tabs.map(([v, t]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-2.5 py-1 text-xs ${view === v ? 'bg-ink text-paper' : 'bg-paper2 text-ink2'}`}
              >
                {t}
              </button>
            ))}
          </div>
          {view !== 'trajectory' && (
            <label className="flex items-center gap-1 text-xs text-ink2">
              Player
              <select
                className="rounded-md border border-line bg-white px-1.5 py-0.5 text-xs"
                value={fpPlayer}
                onChange={(e) => setFpPlayer(e.target.value)}
              >
                {playersByScore(p).map(([n]) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {view === 'trajectory' && <Trajectory p={p} sel={sel} focused={focused} selected={selected} />}
      {view === 'fingerprint' && <Fingerprint p={p} sel={sel} feats={feats} player={fpPlayer} ranges={allRanges} />}
      {view === 'wvb' && <WhiteVsBlack p={p} player={fpPlayer} ranges={allRanges} />}
    </section>
  );
}

function Trajectory({ p, sel, focused, selected }: { p: Profile; sel: SliceSel; focused: string | null; selected: Set<string> }) {
  const fid = focused ?? availableFeatures(p)[0];
  const plotted = playersByScore(p)
    .map(([n]) => n)
    .filter((n) => selected.has(n))
    .slice(0, PALETTE.length);
  const cside = sel.color === 'all' ? 'both colours' : sel.color === 'w' ? 'White' : 'Black';
  const datasets = plotted.map((name, i) => {
    const color = PALETTE[i % PALETTE.length];
    return {
      label: name,
      borderColor: color,
      backgroundColor: color + '22',
      borderWidth: 2,
      pointRadius: 3,
      spanGaps: false,
      data: PHASES.map((ph) => {
        const s = sliceValue(p.players[name], fid, { phase: ph, color: sel.color });
        return s.n >= p.n_min && Number.isFinite(s.mean) ? s.mean : null;
      }),
    };
  });
  return (
    <>
      <p className="mb-1 mt-2 text-xs text-ink2">
        <b>{p.meta[fid]?.name ?? fid}</b> across phases — one line per selected radar player ({cside}). Click a matrix
        column to change the feature; low-sample points dropped.
      </p>
      <div className="relative h-[300px]">
        <Line
          data={{ labels: PHASES.map((ph) => PHASE_LABEL[ph]), datasets }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
            scales: { y: { title: { display: true, text: p.meta[fid]?.name ?? fid } } },
          }}
        />
      </div>
    </>
  );
}

function Fingerprint({
  p,
  sel,
  feats,
  player,
  ranges,
}: {
  p: Profile;
  sel: SliceSel;
  feats: string[];
  player: string;
  ranges: Record<string, { lo: number; hi: number }>;
}) {
  const d = p.players[player];
  return (
    <>
      <p className="mb-2 mt-2 text-xs text-ink2">
        <b>{player}</b> — value per phase ({sel.color === 'all' ? 'both colours' : sel.color === 'w' ? 'White' : 'Black'};
        colour = standing vs the field, — = too few games)
      </p>
      <div className="max-h-[360px] overflow-auto rounded-md border border-line">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-paper2">
            <tr>
              <th className="px-2 py-1 text-left font-semibold text-ink2">Feature</th>
              {PHASES.map((ph) => (
                <th key={ph} className="px-2 py-1 text-right font-semibold text-ink2">
                  {PHASE_LABEL[ph]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {feats.map((id) => (
              <tr key={id}>
                <td className="whitespace-nowrap px-2 py-0.5">{p.meta[id]?.name ?? id}</td>
                {PHASES.map((ph) => {
                  const s = sliceValue(d, id, { phase: ph, color: sel.color });
                  const low = !Number.isFinite(s.mean) || s.n < p.n_min;
                  const g = low ? null : goodness(s.mean, ranges[id].lo, ranges[id].hi, p.meta[id]?.higher ?? 'neutral');
                  return (
                    <td
                      key={ph}
                      className={`px-2 py-0.5 text-right tabular-nums ${low ? 'text-ink2/50' : ''}`}
                      style={g == null ? undefined : { background: cellColor(g) }}
                    >
                      {low ? '—' : fmt(s.mean)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function WhiteVsBlack({ p, player, ranges }: { p: Profile; player: string; ranges: Record<string, { lo: number; hi: number }> }) {
  const d = p.players[player];
  const groups = clusters(p);
  const g = (id: string, mean: number | null | undefined) => {
    const v = goodness(mean ?? NaN, ranges[id].lo, ranges[id].hi, p.meta[id]?.higher ?? 'neutral');
    return v == null ? 0.5 : Math.round(v * 100) / 100;
  };
  return (
    <>
      <p className="mb-1 mt-2 text-xs text-ink2">
        <b>{player}</b> — White vs Black profile (outward = better; the gap is colour asymmetry)
      </p>
      <div className="mb-2 flex gap-4 text-[11px]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PALETTE[1] }} /> White
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PALETTE[0] }} /> Black
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        {groups.map((cl, ci) => (
          <div key={ci}>
            <div className="mb-0.5 text-center text-[11.5px] font-semibold text-ink2">{cl.title}</div>
            <div className="relative h-[230px]">
              <Radar
                data={{
                  labels: cl.ids.map((id) => p.meta[id]?.name ?? id),
                  datasets: [
                    {
                      label: 'White',
                      data: cl.ids.map((id) => g(id, d?.rollups[id]?.mean_white)),
                      borderColor: PALETTE[1],
                      backgroundColor: PALETTE[1] + '22',
                      borderWidth: 1.5,
                      pointRadius: 2,
                    },
                    {
                      label: 'Black',
                      data: cl.ids.map((id) => g(id, d?.rollups[id]?.mean_black)),
                      borderColor: PALETTE[0],
                      backgroundColor: PALETTE[0] + '22',
                      borderWidth: 1.5,
                      pointRadius: 2,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  animation: false,
                  scales: { r: { min: 0, max: 1, ticks: { display: false }, pointLabels: { font: { size: 9 } } } },
                  plugins: { legend: { display: false } },
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
