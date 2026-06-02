import { useMemo } from 'react';
import type { Profile } from '../types';
import { type ProfUi, type SliceSel, playersByScore, takeaway } from '../lib/profile';
import { type Metric, featureGroups, groupRanges, playerNames, playerPrefix, traitGroups } from '../lib/metrics';
import { traitTable } from '../lib/traits';
import { useJson } from '../hooks/useFetch';
import { FilterBar } from '../components/FilterBar';
import { MetricMatrix } from '../components/MetricMatrix';
import { PlayerBreakdown } from '../components/PlayerBreakdown';
import { WinningDNA } from '../components/WinningDNA';
import { FocusPanel } from '../components/FocusPanel';
import { FeatureScatter } from '../components/FeatureScatter';
import { PhaseColourCard } from '../components/PhaseColourCard';
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
  const top3 = useMemo(() => (p ? playersByScore(p).slice(0, 3).map(([n]) => n) : []), [p]);

  // The two column models (features by category, traits by behaviour) over the slice.
  const names = useMemo(() => (p ? playerNames(p) : []), [p]);
  const prefix = useMemo(() => (p ? playerPrefix(p) : []), [p]);
  const featGroups = useMemo(() => (p ? featureGroups(p, ui.sel) : []), [p, ui.sel]);
  const tGroups = useMemo(() => (p && tt ? traitGroups(p, ui.sel, tt) : []), [p, ui.sel, tt]);
  const featRanges = useMemo(() => groupRanges(featGroups, names, p?.n_min ?? 3), [featGroups, names, p]);
  const traitRanges = useMemo(() => groupRanges(tGroups, names, p?.n_min ?? 3), [tGroups, names, p]);

  if (loading) return <p className="text-ink2">Loading profile…</p>;
  if (error || !p || !tt) return <p className="text-w">Couldn’t load {slug}: {error ?? 'no data'}</p>;

  const setSel = (sel: SliceSel) => onUi({ sel });
  const activePlayer = player && p.players[player] ? player : null;
  const compare = new Set(ui.compare.length ? ui.compare : top3);
  const expanded = new Set(ui.expanded);

  // Click a player name → select + open the matching drill; same click again closes it.
  const drillVia = (mode: 'feature' | 'trait') => (name: string) => {
    if (activePlayer === name && ui.drill === mode) { onPlayer(null); onUi({ drill: null }); }
    else { onPlayer(name); onUi({ drill: mode }); }
  };
  const closeDrill = () => { onPlayer(null); onUi({ drill: null }); };
  const toggleExpand = (key: string) => onUi({ expanded: ui.expanded.includes(key) ? ui.expanded.filter((k) => k !== key) : [...ui.expanded, key] });
  const toggleCompare = (name: string) => {
    const base = ui.compare.length ? ui.compare : [...top3];
    onUi({ compare: base.includes(name) ? base.filter((n) => n !== name) : [...base, name] });
  };
  // focusing a column: trait roll-ups persist as ui.trait, raw features as ui.feature (FocusPanel)
  const onFocus = (id: string) => (id.startsWith('trait:') ? onUi({ trait: id.slice(6) }) : onUi({ feature: id }));

  // flat visible metric columns for the breakdown (mirrors the matrix's visible columns)
  const flatVisible = (groups: typeof tGroups, expandable: boolean): Metric[] =>
    groups.flatMap((g) => [...(g.lead ? [g.lead] : []), ...(!expandable || !g.lead || expanded.has(g.key) ? g.members : [])]);

  return (
    <>
      <div className="mb-4 rounded-lg border border-line bg-white/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg leading-tight">{p.label}</h2>
            <p className="text-xs text-ink2">{Object.keys(p.players).length} players · features below, then the same view by temperament</p>
          </div>
          <FilterBar sel={ui.sel} onChange={setSel} emitCross={p.emit_cross} />
        </div>
        {tk && (
          <p className="mt-2.5 border-l-2 border-good pl-3 text-sm leading-snug text-ink">
            <span className="font-medium">Takeaway.</span> {tk}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0">
          <MetricMatrix
            names={names}
            prefix={prefix}
            groups={featGroups}
            ranges={featRanges}
            nMin={p.n_min}
            focused={ui.feature}
            onFocus={onFocus}
            player={ui.drill === 'feature' ? activePlayer : null}
            onSelectPlayer={drillVia('feature')}
          />
          <p className="mt-1.5 text-[11px] text-ink2">
            Each cell is a player’s mean; colour ranks them within the column (green = better, red = worse), faint = below {p.n_min} games.
            Click a column header to focus + sort by it; click a player for their per-game breakdown.
          </p>
          {activePlayer && ui.drill === 'feature' && (
            <PlayerBreakdown
              p={p}
              player={activePlayer}
              title="per-game breakdown"
              metrics={flatVisible(featGroups, false)}
              ranges={featRanges}
              sel={ui.sel}
              onClose={closeDrill}
              onOpenGame={onOpenGame}
            />
          )}
        </div>
        <aside className="flex min-w-0 flex-col gap-4">
          <FocusPanel p={p} fid={ui.feature} sel={ui.sel} />
        </aside>
      </div>

      {/* ── same matrix, by temperament (replaces the radar) ──────────── */}
      <div className="mt-6 lg:mr-[350px]">
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
          focused={ui.feature}
          onFocus={onFocus}
          initialSortKey={`trait:${ui.trait}`}
          expandable
          expanded={expanded}
          onToggleExpand={toggleExpand}
          player={ui.drill === 'trait' ? activePlayer : null}
          onSelectPlayer={drillVia('trait')}
          compare={compare}
          onToggleCompare={toggleCompare}
        />
        <p className="mt-1.5 text-[11px] text-ink2">
          Trait cells are field-relative (green = more of the trait); member features keep their own direction. Checkbox adds a player to the Phase &amp; colour comparison.
        </p>
        {activePlayer && ui.drill === 'trait' && (
          <PlayerBreakdown
            p={p}
            player={activePlayer}
            title="games by temperament"
            metrics={flatVisible(tGroups, true)}
            ranges={traitRanges}
            sel={ui.sel}
            onClose={closeDrill}
            onOpenGame={onOpenGame}
          />
        )}
      </div>

      <div className="mt-5 flex flex-col gap-5">
        <PhaseColourCard p={p} sel={ui.sel} focused={ui.feature} selected={compare} />
        <FeatureScatter p={p} sel={ui.sel} />
      </div>

      <RightDrawer label="Insights">
        <WinningDNA p={p} sel={ui.sel} table={tt} />
        <CorrelationMatrix p={p} sel={ui.sel} table={tt} />
      </RightDrawer>
    </>
  );
}
