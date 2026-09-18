import { useMemo, useState } from 'react';
import type { Profile } from '../types';
import { type ProfUi, type SliceSel, takeaway } from '../lib/profile';
import { type Metric, featureGroups, groupRanges, playerNames, playerPrefix, traitGroups } from '../lib/metrics';
import { traitTable } from '../lib/traits';
import { useJson } from '../hooks/useFetch';
import { FilterBar } from '../components/FilterBar';
import { MetricMatrix } from '../components/MetricMatrix';
import { PlayerBreakdown } from '../components/PlayerBreakdown';
import { WinningDNA } from '../components/WinningDNA';
import { FocusPanel } from '../components/FocusPanel';
import { RightDrawer } from '../components/RightDrawer';
import { CorrelationMatrix } from '../components/CorrelationMatrix';
import { TeamsPanel } from '../components/TeamsPanel';

export function ProfilesView({
  slug,
  onOpenGame,
  player,
  onPlayer,
  ui,
  onUi,
}: {
  slug: string;
  onOpenGame?: (id: string) => void;
  player: string | null;
  onPlayer: (name: string | null) => void;
  ui: ProfUi;
  onUi: (u: Partial<ProfUi>) => void;
}) {
  const { data: p, loading, error } = useJson<Profile>(`./data/profiles/${slug}.json`);

  // Players / Teams mode + country filter (team events only — FIDE Olympiad, CLAUDE.md §16/§17).
  const [viewMode, setViewMode] = useState<'players' | 'teams'>('players');
  const [country, setCountry] = useState('all');
  const [filterSlug, setFilterSlug] = useState(slug); // last slug these filters were reset for
  if (slug !== filterSlug) {
    setFilterSlug(slug);
    setViewMode('players');
    setCountry('all');
  }
  const countries = useMemo(() => {
    const set = new Set<string>();
    if (p) for (const d of Object.values(p.players)) if (d.team) set.add(d.team);
    return [...set].sort();
  }, [p]);

  // A Profile-shaped view over team_profile (CLAUDE.md §17: team_profile reuses the exact
  // same reducer/rollup machinery as the player profile, grouped by team instead of player —
  // so every field a player has, a team has too, board-pooled the same way TPR/avg-opponent
  // already are). This lets every player-mode component below — matrix, traits, breakdown,
  // Winning DNA, correlations — run completely unmodified against teams: no parallel
  // "team matrix" implementation to keep in sync, real "exact same fields" rather than a
  // lookalike.
  const teamsAsProfile: Profile | null = useMemo(() => {
    if (!p?.team_profile) return null;
    const tp = p.team_profile;
    return {
      slug: p.slug, label: p.label, has_clock: p.has_clock, has_eval: p.has_eval,
      n_min: tp.n_min, emit_cross: p.emit_cross, meta: p.meta,
      players: tp.teams as unknown as Profile['players'],
      leaderboards: tp.leaderboards,
      result_correlation: tp.result_correlation,
      feature_correlation: tp.feature_correlation,
    };
  }, [p]);

  const activeP = viewMode === 'teams' && teamsAsProfile ? teamsAsProfile : p;

  const tt = useMemo(() => (activeP ? traitTable(activeP, ui.sel) : null), [activeP, ui.sel]);
  const tk = useMemo(() => (viewMode === 'players' && p ? takeaway(p, ui.sel.phase) : null), [viewMode, p, ui.sel.phase]);
  const allNames = useMemo(() => (activeP ? playerNames(activeP) : []), [activeP]);
  const names = useMemo(
    () => (viewMode === 'players' && country !== 'all' ? allNames.filter((n) => p?.players[n]?.team === country) : allNames),
    [allNames, p, country, viewMode],
  );
  const prefix = useMemo(() => (activeP ? playerPrefix(activeP) : []), [activeP]);
  const featGroups = useMemo(() => (activeP ? featureGroups(activeP, ui.sel) : []), [activeP, ui.sel]);
  const tGroups = useMemo(() => (activeP && tt ? traitGroups(activeP, ui.sel, tt) : []), [activeP, ui.sel, tt]);
  const featRanges = useMemo(() => groupRanges(featGroups, names, activeP?.n_min ?? 3), [featGroups, names, activeP]);
  const traitRanges = useMemo(() => groupRanges(tGroups, names, activeP?.n_min ?? 3), [tGroups, names, activeP]);

  // id -> Metric, for resolving the focused column into its ranking panel.
  const byId = useMemo(() => {
    const m = new Map<string, Metric>();
    for (const g of [...featGroups, ...tGroups]) {
      if (g.lead) m.set(g.lead.id, g.lead);
      for (const mem of g.members) m.set(mem.id, mem);
    }
    return m;
  }, [featGroups, tGroups]);

  if (loading) return <p className="text-ink2">Loading profile…</p>;
  if (error || !p || !activeP || !tt) return <p className="text-w">Couldn’t load {slug}: {error ?? 'no data'}</p>;

  const activePlayer = player && names.includes(player) ? player : null;
  const expanded = new Set(ui.expanded);
  const selectPlayer = (name: string) => onPlayer(activePlayer === name ? null : name);
  const toggleExpand = (key: string) =>
    onUi({ expanded: ui.expanded.includes(key) ? ui.expanded.filter((k) => k !== key) : [...ui.expanded, key] });

  // The trait the temperament view is focused on (a trait roll-up or one of its members).
  const focusTraitKey = ui.traitFocus.startsWith('trait:')
    ? ui.traitFocus.slice(6)
    : tGroups.find((g) => g.members.some((m) => m.id === ui.traitFocus))?.key ?? tGroups[0]?.key ?? '';
  const focusGroup = tGroups.find((g) => g.key === focusTraitKey);

  const allFeatureMetrics: Metric[] = featGroups.flatMap((g) => g.members);
  // Temperament breakdown columns (item 5): the focused trait, then its component features,
  // then the rest of the features.
  const memberIds = new Set(focusGroup?.members.map((m) => m.id) ?? []);
  const traitBreakdownMetrics: Metric[] = [
    ...(focusGroup?.lead ? [focusGroup.lead] : []),
    ...(focusGroup?.members ?? []),
    ...allFeatureMetrics.filter((m) => !memberIds.has(m.id)),
  ];

  const unitLabel = viewMode === 'teams' ? 'teams' : 'players';
  const unitSingular = viewMode === 'teams' ? 'team' : 'player';

  return (
    <>
      <div className="mb-4 rounded-lg border border-line bg-white/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg leading-tight">{p.label}</h2>
            <p className="text-xs text-ink2">{names.length} {unitLabel} · click a column to rank it on the right · click a {unitSingular} for their games</p>
          </div>
          {viewMode === 'players' && <FilterBar sel={ui.sel} onChange={(sel: SliceSel) => onUi({ sel })} emitCross={p.emit_cross} />}
        </div>
        {p.team_profile && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="inline-flex overflow-hidden rounded-md border border-line text-sm">
              {(['players', 'teams'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`px-3 py-1 ${viewMode === m ? 'bg-ink text-paper' : 'bg-white text-ink2'}`}
                  onClick={() => setViewMode(m)}
                >
                  {m === 'players' ? 'Players' : 'Teams'}
                </button>
              ))}
            </div>
            {viewMode === 'players' && countries.length > 0 && (
              <label className="flex items-center gap-1.5 text-sm text-ink2">
                Country
                <select
                  className="rounded-md border border-line bg-white px-2 py-1 text-sm"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  <option value="all">All countries</option>
                  {countries.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        {tk && viewMode === 'players' && (
          <p className="mt-2.5 border-l-2 border-good pl-3 text-sm leading-snug text-ink">
            <span className="font-medium">Takeaway.</span> {tk}
          </p>
        )}
      </div>

      {/* Team-only extra: match-level standings have no player analogue (CLAUDE.md §17
          _team_matches) — everything below this is the identical player-mode system. */}
      {viewMode === 'teams' && p.team_profile && <TeamsPanel tp={p.team_profile} />}

      {/* ── features ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0">
          <MetricMatrix
            names={names}
            prefix={prefix}
            groups={featGroups}
            ranges={featRanges}
            nMin={activeP.n_min}
            focused={ui.featFocus}
            onFocus={(id) => onUi({ featFocus: id })}
            player={activePlayer}
            onSelectPlayer={selectPlayer}
            countryOf={(n) => p.players[n]?.team}
          />
          <p className="mt-1.5 text-[11px] text-ink2">
            Each cell is a {unitSingular}’s mean; colour ranks them within the column (green = better, red = worse), faint = below {activeP.n_min} games.
            Click a header to rank that feature on the right; click a {unitSingular} for their per-game breakdown.
          </p>
          {activePlayer && (
            <PlayerBreakdown
              p={activeP}
              player={activePlayer}
              title="per-game breakdown"
              metrics={allFeatureMetrics}
              ranges={featRanges}
              sel={ui.sel}
              onClose={() => onPlayer(null)}
              onOpenGame={onOpenGame}
            />
          )}
        </div>
        <aside className="flex min-w-0 flex-col gap-4">
          <FocusPanel metric={byId.get(ui.featFocus) ?? null} names={names} nMin={activeP.n_min} />
        </aside>
      </div>

      {/* ── same system, by temperament ─────────────────────────────── */}
      <div className="mt-7 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <h3 className="font-display text-base">By temperament</h3>
            <p className="text-[11px] text-ink2">six behavioural traits, each a roll-up of its features · expand a trait to see them</p>
          </div>
          <MetricMatrix
            names={names}
            prefix={prefix}
            groups={tGroups}
            ranges={traitRanges}
            nMin={activeP.n_min}
            focused={ui.traitFocus}
            onFocus={(id) => onUi({ traitFocus: id })}
            expandable
            expanded={expanded}
            onToggleExpand={toggleExpand}
            player={activePlayer}
            onSelectPlayer={selectPlayer}
            countryOf={(n) => p.players[n]?.team}
          />
          <p className="mt-1.5 text-[11px] text-ink2">
            Trait cells are field-relative (green = more of the trait); member features keep their own direction. Click a trait to rank it on the right.
          </p>
          {activePlayer && (
            <PlayerBreakdown
              p={activeP}
              player={activePlayer}
              title={focusGroup ? `games — ${focusGroup.label.toLowerCase()} first` : 'games by temperament'}
              metrics={traitBreakdownMetrics}
              ranges={new Map([...featRanges, ...traitRanges])}
              sel={ui.sel}
              onClose={() => onPlayer(null)}
              onOpenGame={onOpenGame}
            />
          )}
        </div>
        <aside className="flex min-w-0 flex-col gap-4">
          <FocusPanel metric={byId.get(ui.traitFocus) ?? null} names={names} nMin={activeP.n_min} />
        </aside>
      </div>

      <RightDrawer label="Insights">
        <WinningDNA p={activeP} sel={ui.sel} table={tt} />
        <CorrelationMatrix p={activeP} sel={ui.sel} table={tt} />
      </RightDrawer>
    </>
  );
}
