import type { TeamProfile } from '../types';

const fmt = (v: number | null) => (v == null ? '–' : Number.isInteger(v) ? String(v) : (Math.round(v * 100) / 100).toFixed(2));

/** Match-level standings for a team event (FIDE Olympiad — CLAUDE.md §17
 *  aggregate._team_matches). This is the one genuinely team-only view — it has no
 *  player analogue (a player doesn't play "matches" of several boards) — everything
 *  else in Teams mode (the feature matrix, temperament, breakdowns, insights) is the
 *  identical player-mode system fed by aggregate.team_profile's board-pooled rollups. */
export function TeamsPanel({ tp }: { tp: TeamProfile }) {
  return (
    <div className="mb-5">
      <h3 className="mb-1.5 font-display text-base">Standings</h3>
      <p className="mb-2 text-[11px] text-ink2">
        Match points (2/1/0 per round) then board points — an approximation of FIDE team
        scoring, no official tiebreaks.
      </p>
      <div className="max-h-[40vh] overflow-auto rounded-md border border-line">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-paper2 text-left text-xs text-ink2">
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
  );
}
