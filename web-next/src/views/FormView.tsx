import { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import type { Profile, TournamentDoc } from '../types';
import { useJson } from '../hooks/useFetch';
import { availableFeatures, playersByScore } from '../lib/profile';
import {
  type GroupStat,
  OUTCOME_COLOR,
  byOpponentStrength,
  byStreak,
  eloIndex,
  formTimeline,
  overallMean,
} from '../lib/form';

const fmt = (v: number | null) => (v == null ? '–' : Number.isInteger(v) ? String(v) : (Math.round(v * 100) / 100).toFixed(2));

export function FormView({ slug, onOpenGame }: { slug: string; onOpenGame?: (id: string) => void }) {
  const prof = useJson<Profile>(`./data/profiles/${slug}.json`);
  const tour = useJson<TournamentDoc>(`./data/t/${slug}.json`);
  const p = prof.data;

  const players = useMemo(() => (p ? playersByScore(p).map(([n]) => n) : []), [p]);
  const feats = useMemo(() => (p ? availableFeatures(p) : []), [p]);
  const [player, setPlayer] = useState<string | null>(null);
  const [fid, setFid] = useState('DYN.initiative');

  useEffect(() => {
    if (players.length) setPlayer((cur) => (cur && players.includes(cur) ? cur : players[0]));
  }, [players]);
  useEffect(() => {
    if (feats.length && !feats.includes(fid)) setFid(feats.includes('DYN.initiative') ? 'DYN.initiative' : feats[0]);
  }, [feats, fid]);

  if (prof.loading || tour.loading) return <p className="text-ink2">Loading…</p>;
  if (!p || !player) return <p className="text-w">No profile for {slug}.</p>;

  const elo = eloIndex(tour.data);
  const doc = p.players[player];
  const games = formTimeline(doc.game_rows, fid, elo);
  const mean = overallMean(games);
  const higher = p.meta[fid]?.higher ?? 'neutral';
  const fname = p.meta[fid]?.name ?? fid;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-line bg-white/60 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-ink2">
            Player
            <select className="rounded-md border border-line bg-white px-2 py-1 text-sm" value={player} onChange={(e) => setPlayer(e.target.value)}>
              {players.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-sm text-ink2">
            Feature
            <select className="rounded-md border border-line bg-white px-2 py-1 text-sm" value={fid} onChange={(e) => setFid(e.target.value)}>
              {feats.map((f) => (
                <option key={f} value={f}>{p.meta[f]?.name ?? f}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="text-sm text-ink2">
          {doc.score}/{doc.games} · {doc.wins}W {doc.draws}D {doc.losses}L
          {doc.performance_elo ? ` · TPR ${doc.performance_elo}` : ''}
        </div>
      </div>

      {/* Form across the rounds */}
      <section className="rounded-lg border border-line bg-white p-3.5">
        <h3 className="font-display text-base">{fname} across the rounds</h3>
        <p className="mb-2 text-[11px] text-ink2">{p.meta[fid]?.description ?? ''} Point colour = result (green win · grey draw · oxblood loss).</p>
        <div className="relative h-[230px]">
          <Line
            data={{
              labels: games.map((g) => `R${g.round}`),
              datasets: [
                {
                  label: fname,
                  data: games.map((g) => g.value),
                  borderColor: '#211c16',
                  borderWidth: 1.5,
                  tension: 0.25,
                  pointRadius: 5,
                  pointBackgroundColor: games.map((g) => OUTCOME_COLOR[g.outcome]),
                  pointBorderColor: games.map((g) => OUTCOME_COLOR[g.outcome]),
                  spanGaps: true,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              animation: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (c) => {
                      const g = games[c.dataIndex];
                      return `R${g.round} ${g.color === 'w' ? 'vs' : 'vs'} ${g.opp} (${g.outcome}): ${fmt(g.value)}`;
                    },
                  },
                },
              },
              scales: { y: { title: { display: true, text: fname } } },
            }}
          />
        </div>
        {/* result strip */}
        <div className="mt-2 flex flex-wrap gap-1">
          {games.map((g) => (
            <button
              key={g.round}
              type="button"
              onClick={() => onOpenGame?.(`${slug}__r${String(g.round).padStart(2, '0')}b${String(boardOf(doc.game_rows, g.round)).padStart(2, '0')}`)}
              title={`R${g.round} vs ${g.opp} — ${g.outcome}; ${fname} ${fmt(g.value)}`}
              className="flex w-12 shrink-0 flex-col items-center rounded border border-line/60 px-1 py-0.5 text-[10px] hover:bg-paper"
            >
              <span className="text-ink2">R{g.round}</span>
              <span style={{ color: OUTCOME_COLOR[g.outcome] }}>{g.outcome}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Temperament: conditioned means */}
      <section className="rounded-lg border border-line bg-white p-3.5">
        <h3 className="font-display text-base">Temperament — {fname} by context</h3>
        <p className="mb-3 text-[11px] text-ink2">
          How the feature shifts vs this player's overall mean ({fmt(mean)}). Colour shows whether the shift is good or
          bad for them ({higher === 'neutral' ? 'neutral feature' : higher === 'good' ? 'higher = better' : 'lower = better'}).
        </p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Conditioned title="After a result" stats={byStreak(games)} mean={mean} higher={higher} />
          <Conditioned title="By opponent" stats={byOpponentStrength(games)} mean={mean} higher={higher} />
        </div>
      </section>

      {/* Round-by-round table */}
      <section className="rounded-lg border border-line bg-white p-3.5">
        <h3 className="mb-2 font-display text-base">Round by round</h3>
        <div className="overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-ink2">
                {['Rd', '', 'Opponent', 'Res', 'Score', fname, 'Entering'].map((h, i) => (
                  <th key={i} className="border-b border-line px-2 py-1 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.round} className="border-b border-line/50">
                  <td className="px-2 py-0.5 text-ink2">{g.round}</td>
                  <td className="px-2 py-0.5">{g.color === 'w' ? '□' : '■'}</td>
                  <td className="whitespace-nowrap px-2 py-0.5">{g.opp}{g.oppElo ? ` (${g.oppElo})` : ''}</td>
                  <td className="px-2 py-0.5 font-semibold" style={{ color: OUTCOME_COLOR[g.outcome] }}>{g.outcome}</td>
                  <td className="px-2 py-0.5 tabular-nums text-ink2">{g.cum}</td>
                  <td className="px-2 py-0.5 tabular-nums">{fmt(g.value)}</td>
                  <td className="px-2 py-0.5 text-ink2">{g.entering === 'start' ? '—' : g.entering.replace('after', 'after ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// recover the board number for a round from the player's rows (for the deep link)
function boardOf(rows: { round: number; id: string }[], round: number): number {
  const r = rows.find((x) => x.round === round);
  const m = r?.id.match(/b(\d+)$/);
  return m ? Number(m[1]) : 1;
}

function Conditioned<K extends string>({
  title,
  stats,
  mean,
  higher,
}: {
  title: string;
  stats: GroupStat<K>[];
  mean: number | null;
  higher: string;
}) {
  const maxAbs = Math.max(0.01, ...stats.map((s) => Math.abs(s.mean - (mean ?? 0))));
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink2">{title}</div>
      {stats.length === 0 && <p className="text-xs text-ink2">— no data</p>}
      {stats.map((s) => {
        const delta = s.mean - (mean ?? 0);
        const good = higher === 'neutral' ? null : higher === 'good' ? delta >= 0 : delta <= 0;
        const color = good == null ? 'var(--color-ink2)' : good ? 'var(--color-good)' : 'var(--color-w)';
        const pos = delta >= 0;
        return (
          <div key={s.key} className="flex items-center gap-2 py-[3px] text-xs">
            <span className="w-24 shrink-0 truncate" title={s.label}>{s.label}</span>
            <span className="relative h-2 flex-1 rounded-sm bg-paper2">
              <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
              <span
                className="absolute inset-y-0 rounded-sm"
                style={pos
                  ? { left: '50%', width: `${(Math.abs(delta) / maxAbs) * 50}%`, background: color }
                  : { right: '50%', width: `${(Math.abs(delta) / maxAbs) * 50}%`, background: color }}
              />
            </span>
            <span className="w-10 shrink-0 text-right tabular-nums">{fmt(s.mean)}</span>
            <span className="w-6 shrink-0 text-right text-[10px] text-ink2">{s.n}</span>
          </div>
        );
      })}
    </div>
  );
}
