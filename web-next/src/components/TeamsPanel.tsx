import { useMemo, useState } from 'react';
import type { FeatureMeta, TeamProfile } from '../types';

const fmt = (v: number | null) => (v == null ? '–' : Number.isInteger(v) ? String(v) : (Math.round(v * 100) / 100).toFixed(2));

/** Team-level standings + feature leaderboard for a team event (FIDE Olympiad —
 *  CLAUDE.md §17 aggregate.team_profile). Simpler than the player MetricMatrix by
 *  design: one focused feature at a time, ranked, rather than the full matrix — the
 *  standings table is the primary "what does country X look like" view here. */
export function TeamsPanel({ tp, meta }: { tp: TeamProfile; meta: Record<string, FeatureMeta> }) {
  const featureIds = useMemo(
    () => Object.keys(tp.leaderboards).filter((id) => tp.leaderboards[id].available)
      .sort((a, b) => (meta[a]?.name ?? a).localeCompare(meta[b]?.name ?? b)),
    [tp, meta],
  );
  const [featureId, setFeatureId] = useState(featureIds[0] ?? '');
  const fid = featureIds.includes(featureId) ? featureId : featureIds[0];
  const board = fid ? tp.leaderboards[fid] : null;
  const m = fid ? meta[fid] : null;
  const minN = tp.n_min || 1;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="mb-1.5 font-display text-base">Standings</h3>
        <p className="mb-2 text-[11px] text-ink2">
          Match points (2/1/0 per round) then board points — an approximation of FIDE team
          scoring, no official tiebreaks.
        </p>
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <thead className="bg-paper2 text-left text-xs text-ink2">
              <tr>
                <th className="px-2 py-1">#</th>
                <th className="px-2 py-1">Team</th>
                <th className="px-2 py-1">Matches</th>
                <th className="px-2 py-1">W-D-L</th>
                <th className="px-2 py-1">Match pts</th>
                <th className="px-2 py-1">Board pts</th>
              </tr>
            </thead>
            <tbody>
              {tp.standings.map((s) => (
                <tr key={s.team} className="border-t border-line">
                  <td className="px-2 py-1 tabular-nums">{s.rank}</td>
                  <td className="px-2 py-1 font-medium">{s.team}</td>
                  <td className="px-2 py-1 tabular-nums">{s.matches}</td>
                  <td className="px-2 py-1 tabular-nums">{s.match_w}-{s.match_d}-{s.match_l}</td>
                  <td className="px-2 py-1 tabular-nums">{s.match_points}</td>
                  <td className="px-2 py-1 tabular-nums">{fmt(s.game_points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <h3 className="font-display text-base">Team feature leaderboard</h3>
          <label className="flex items-center gap-1.5 text-sm text-ink2">
            Feature
            <select
              className="rounded-md border border-line bg-white px-2 py-1 text-sm"
              value={fid ?? ''}
              onChange={(e) => setFeatureId(e.target.value)}
            >
              {featureIds.map((id) => (
                <option key={id} value={id}>{meta[id]?.name ?? id}</option>
              ))}
            </select>
          </label>
        </div>
        {m?.description && <p className="mb-2 text-xs text-ink2">{m.description}</p>}
        {board && fid && (
          <ol className="flex flex-col gap-1">
            {board.entries.map(([team, mean, n], i) => (
              <li
                key={team}
                className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${n < minN ? 'opacity-50' : ''}`}
              >
                <span className="w-6 text-right tabular-nums text-ink2">{i + 1}</span>
                <span className="flex-1 truncate font-medium">{team}</span>
                <span className="tabular-nums">{fmt(mean)}</span>
                <span className="text-[11px] text-ink2">n={n}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
