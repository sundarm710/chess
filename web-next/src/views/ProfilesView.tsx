import { useMemo } from 'react';
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

  const tt = useMemo(() => (p ? traitTable(p, ui.sel) : null), [p, ui.sel]);
  const tk = useMemo(() => (p ? takeaway(p, ui.sel.phase) : null), [p, ui.sel.phase]);
  const names = useMemo(() => (p ? playerNames(p) : []), [p]);
  const prefix = useMemo(() => (p ? playerPrefix(p) : []), [p]);
  const featGroups = useMemo(() => (p ? featureGroups(p, ui.sel) : []), [p, ui.sel]);
  const tGroups = useMemo(() => (p && tt ? traitGroups(p, ui.sel, tt) : []), [p, ui.sel, tt]);
  const featRanges = useMemo(() => groupRanges(featGroups, names, p?.n_min ?? 3), [featGroups, names, p]);
  const traitRanges = useMemo(() => groupRanges(tGroups, names, p?.n_min ?? 3), [tGroups, names, p]);

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
  if (error || !p || !tt) return <p className="text-w">Couldn’t load {slug}: {error ?? 'no data'}</p>;

  const activePlayer = player && p.players[player] ? player : null;
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

  return (
    <>
      <div className="mb-4 rounded-lg border border-line bg-white/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg leading-tight">{p.label}</h2>
            <p className="text-xs text-ink2">{Object.keys(p.players).length} players · click a column to rank it on the right · click a player for their games</p>
          </div>
          <FilterBar sel={ui.sel} onChange={(sel: SliceSel) => onUi({ sel })} emitCross={p.emit_cross} />
        </div>
        {tk && (
          <p className="mt-2.5 border-l-2 border-good pl-3 text-sm leading-snug text-ink">
            <span className="font-medium">Takeaway.</span> {tk}
          </p>
        )}
      </div>

      {/* ── features ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0">
          <MetricMatrix
            names={names}
            prefix={prefix}
            groups={featGroups}
            ranges={featRanges}
            nMin={p.n_min}
            focused={ui.featFocus}
            onFocus={(id) => onUi({ featFocus: id })}
            player={activePlayer}
            onSelectPlayer={selectPlayer}
          />
          <p className="mt-1.5 text-[11px] text-ink2">
            Each cell is a player’s mean; colour ranks them within the column (green = better, red = worse), faint = below {p.n_min} games.
            Click a header to rank that feature on the right; click a player for their per-game breakdown.
          </p>
          {activePlayer && (
            <PlayerBreakdown
              p={p}
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
          <FocusPanel metric={byId.get(ui.featFocus) ?? null} names={names} nMin={p.n_min} />
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
            nMin={p.n_min}
            focused={ui.traitFocus}
            onFocus={(id) => onUi({ traitFocus: id })}
            expandable
            expanded={expanded}
            onToggleExpand={toggleExpand}
            player={activePlayer}
            onSelectPlayer={selectPlayer}
          />
          <p className="mt-1.5 text-[11px] text-ink2">
            Trait cells are field-relative (green = more of the trait); member features keep their own direction. Click a trait to rank it on the right.
          </p>
          {activePlayer && (
            <PlayerBreakdown
              p={p}
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
          <FocusPanel metric={byId.get(ui.traitFocus) ?? null} names={names} nMin={p.n_min} />
        </aside>
      </div>

      <RightDrawer label="Insights">
        <WinningDNA p={p} sel={ui.sel} table={tt} />
        <CorrelationMatrix p={p} sel={ui.sel} table={tt} />
      </RightDrawer>
    </>
  );
}
