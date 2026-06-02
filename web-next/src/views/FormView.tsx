import { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import type { Profile, TournamentDoc } from '../types';
import { useJson } from '../hooks/useFetch';
import { playersByScore } from '../lib/profile';
import { OUTCOME_COLOR, byOpponentStrength, byStreak, eloIndex, formTimeline } from '../lib/form';
import { asSeries, buildTemperament, tempColor } from '../lib/temperament';
import { TemperamentHeatmap, type RoundHead, type Selection } from '../components/TemperamentHeatmap';

const fmt = (v: number | null) => (v == null ? '–' : Number.isInteger(v) ? String(v) : (Math.round(v * 100) / 100).toFixed(2));
const z2 = (z: number | null) => (z == null ? '–' : `${z >= 0 ? '+' : ''}${z.toFixed(2)}`);

export function FormView({ slug, onOpenGame }: { slug: string; onOpenGame?: (id: string) => void }) {
  const prof = useJson<Profile>(`./data/profiles/${slug}.json`);
  const tour = useJson<TournamentDoc>(`./data/t/${slug}.json`);
  const p = prof.data;

  const players = useMemo(() => (p ? playersByScore(p).map(([n]) => n) : []), [p]);
  const [pick, setPick] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Selection>({ kind: 'cluster', key: 'aggression' });

  if (prof.loading || tour.loading) return <p className="text-ink2">Loading…</p>;
  if (!p || !players.length) return <p className="text-w">No profile for {slug}.</p>;

  // derive the active player (no setState-in-effect) so a slug change can't strand a stale pick
  const player = pick && players.includes(pick) ? pick : players[0];
  const setPlayer = setPick;
  const elo = eloIndex(tour.data);
  const doc = p.players[player];
  const games = formTimeline(doc.game_rows, 'DYN.initiative', elo); // any fid; we read raw vals below

  // Which feature ids actually carry data for this player (drives the clusters).
  const available = new Set<string>();
  for (const r of doc.game_rows) for (const k of Object.keys(r.vals)) if (Number.isFinite(r.vals[k])) available.add(k);
  const valsByRound = new Map(doc.game_rows.map((r) => [r.round, r.vals]));
  const valueOf = (g: (typeof games)[number], fid: string) => valsByRound.get(g.round)?.[fid] ?? null;

  const rows = buildTemperament(games, valueOf, available, p.meta);
  const rounds: RoundHead[] = games.map((g) => ({
    round: g.round,
    outcome: g.outcome,
    opp: g.opp,
    color: g.color,
    id: `${slug}__r${String(g.round).padStart(2, '0')}b${String(boardOf(doc.game_rows, g.round)).padStart(2, '0')}`,
  }));

  // keep the selection valid as players/data change
  const validSel =
    (selected.kind === 'cluster' && rows.some((r) => r.key === selected.key)) ||
    (selected.kind === 'feature' && rows.some((r) => r.features.some((f) => f.fid === selected.key)));
  const sel: Selection = validSel ? selected : { kind: 'cluster', key: rows[0]?.key ?? 'aggression' };

  // resolve the focused series (cluster or member feature) for the drill-down
  const focusRow = rows.find((r) =>
    sel.kind === 'cluster' ? r.key === sel.key : r.features.some((f) => f.fid === sel.key),
  );
  const focusFeat = sel.kind === 'feature' ? focusRow?.features.find((f) => f.fid === sel.key) : undefined;
  const cells = (focusFeat ? focusFeat.cells : focusRow?.cells) ?? [];
  const focusLabel = focusFeat ? focusFeat.name : (focusRow?.label ?? '');
  const focusBlurb = focusFeat ? (p.meta[focusFeat.fid]?.description ?? '') : (focusRow?.blurb ?? '');
  const series = asSeries(games, cells);
  const byRes = byStreak(series);
  const byOpp = byOpponentStrength(series);

  const openGame = (id: string) => onOpenGame?.(id);
  const toggle = (key: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  return (
    <div className="flex flex-col gap-4">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-line bg-white/60 p-3">
        <label className="flex items-center gap-1.5 text-sm text-ink2">
          Player
          <select className="rounded-md border border-line bg-white px-2 py-1 text-sm" value={player} onChange={(e) => setPlayer(e.target.value)}>
            {players.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <div className="text-sm text-ink2">
          {doc.score}/{doc.games} · {doc.wins}W {doc.draws}D {doc.losses}L
          {doc.performance_elo ? ` · TPR ${doc.performance_elo}` : ''}
        </div>
      </div>

      {/* ── HERO: temperament heatmap ─────────────────────────────── */}
      <section className="rounded-lg border border-line bg-white p-3.5">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="font-display text-base">Temperament — round by round</h3>
          <span className="text-[11px] text-ink2">click a row to drill in · click a cell to open the game</span>
        </div>
        <p className="mb-3 text-[11px] text-ink2">
          Six behavioural traits, each folded from several raw features. Colour shows how dialled-up a trait was that
          round versus how <span className="font-semibold">{player}</span> normally plays — the tournament's emotional arc.
        </p>
        <TemperamentHeatmap
          rows={rows}
          rounds={rounds}
          expanded={expanded}
          onToggle={toggle}
          selected={sel}
          onSelect={setSelected}
          onOpenGame={openGame}
        />
      </section>

      {/* ── drill-down for the focused trait/feature ──────────────── */}
      <section className="rounded-lg border border-line bg-white p-3.5">
        <h3 className="font-display text-base">{focusLabel} across the rounds</h3>
        <p className="mb-2 text-[11px] text-ink2">{focusBlurb} Plotted as deviation from baseline; point colour = result.</p>
        <div className="relative h-[210px]">
          <Line
            data={{
              labels: series.map((g) => `R${g.round}`),
              datasets: [
                {
                  label: focusLabel,
                  data: series.map((g) => g.value),
                  borderColor: '#211c16',
                  borderWidth: 1.5,
                  tension: 0.25,
                  pointRadius: 5,
                  pointBackgroundColor: series.map((g) => OUTCOME_COLOR[g.outcome]),
                  pointBorderColor: series.map((g) => OUTCOME_COLOR[g.outcome]),
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
                      const g = series[c.dataIndex];
                      return `R${g.round} vs ${g.opp} (${g.outcome}): ${z2(g.value)} vs baseline`;
                    },
                  },
                },
              },
              scales: { y: { title: { display: true, text: 'vs baseline (z)' }, grid: { color: (c) => (c.tick.value === 0 ? '#b59169' : 'rgba(0,0,0,0.05)') } } },
            }}
          />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Conditioned title="After a result" stats={byRes} />
          <Conditioned title="By opponent" stats={byOpp} />
        </div>
      </section>

      {/* round-by-round table for the focused trait */}
      <section className="rounded-lg border border-line bg-white p-3.5">
        <h3 className="mb-2 font-display text-base">Round by round — {focusLabel}</h3>
        <div className="overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-ink2">
                {['Rd', '', 'Opponent', 'Res', 'Score', focusFeat ? 'Value' : 'Trait z', focusFeat ? 'vs base' : '', 'Entering'].map((h, i) => (
                  <th key={i} className="border-b border-line px-2 py-1 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((g, i) => (
                <tr key={g.round} className="border-b border-line/50">
                  <td className="px-2 py-0.5 text-ink2">{g.round}</td>
                  <td className="px-2 py-0.5">{g.color === 'w' ? '□' : '■'}</td>
                  <td className="whitespace-nowrap px-2 py-0.5">{g.opp}{g.oppElo ? ` (${g.oppElo})` : ''}</td>
                  <td className="px-2 py-0.5 font-semibold" style={{ color: OUTCOME_COLOR[g.outcome] }}>{g.outcome}</td>
                  <td className="px-2 py-0.5 tabular-nums text-ink2">{g.cum}</td>
                  <td className="px-2 py-0.5 tabular-nums">{focusFeat ? fmt(focusFeat.cells[i].value) : z2(g.value)}</td>
                  {focusFeat ? <td className="px-2 py-0.5 tabular-nums" style={{ color: tempColor((g.value ?? 0) >= 0 ? 1.6 : -1.6) }}>{z2(g.value)}</td> : <td />}
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

// conditioned-mean bars, coloured by the temperament diverging scale (warm = trait up
// in that context, cool = down). Works on the focused z-series (baseline ≈ 0).
function Conditioned<K extends string>({ title, stats }: { title: string; stats: { key: K; label: string; mean: number; n: number }[] }) {
  const maxAbs = Math.max(0.2, ...stats.map((s) => Math.abs(s.mean)));
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink2">{title}</div>
      {stats.length === 0 && <p className="text-xs text-ink2">— no data</p>}
      {stats.map((s) => {
        const pos = s.mean >= 0;
        const color = tempColor(pos ? 1.6 : -1.6);
        return (
          <div key={s.key} className="flex items-center gap-2 py-[3px] text-xs">
            <span className="w-24 shrink-0 truncate" title={s.label}>{s.label}</span>
            <span className="relative h-2 flex-1 rounded-sm bg-paper2">
              <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
              <span
                className="absolute inset-y-0 rounded-sm"
                style={pos
                  ? { left: '50%', width: `${(Math.abs(s.mean) / maxAbs) * 50}%`, background: color }
                  : { right: '50%', width: `${(Math.abs(s.mean) / maxAbs) * 50}%`, background: color }}
              />
            </span>
            <span className="w-12 shrink-0 text-right font-mono tabular-nums">{z2(s.mean)}</span>
            <span className="w-6 shrink-0 text-right text-[10px] text-ink2">{s.n}</span>
          </div>
        );
      })}
    </div>
  );
}
