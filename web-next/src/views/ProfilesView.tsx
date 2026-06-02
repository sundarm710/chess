import { useMemo } from 'react';
import type { Profile } from '../types';
import { type ProfUi, type SliceSel, playersByScore, takeaway } from '../lib/profile';
import { traitTable } from '../lib/traits';
import { useJson } from '../hooks/useFetch';
import { FilterBar } from '../components/FilterBar';
import { Matrix } from '../components/Matrix';
import { WinningDNA } from '../components/WinningDNA';
import { FocusPanel } from '../components/FocusPanel';
import { PlayerGames } from '../components/PlayerGames';
import { TraitMatrix } from '../components/TraitMatrix';
import { TraitPlayerGames } from '../components/TraitPlayerGames';
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

  if (loading) return <p className="text-ink2">Loading profile…</p>;
  if (error || !p || !tt) return <p className="text-w">Couldn’t load {slug}: {error ?? 'no data'}</p>;

  const setSel = (sel: SliceSel) => onUi({ sel });
  const activePlayer = player && p.players[player] ? player : null;
  const compare = new Set(ui.compare.length ? ui.compare : top3);

  // Click a player name → select + open the matching drill; click the same one again closes it.
  const drillVia = (mode: 'feature' | 'trait') => (name: string) => {
    if (activePlayer === name && ui.drill === mode) {
      onPlayer(null);
      onUi({ drill: null });
    } else {
      onPlayer(name);
      onUi({ drill: mode });
    }
  };
  const toggleExpand = (key: string) =>
    onUi({ expanded: ui.expanded.includes(key) ? ui.expanded.filter((k) => k !== key) : [...ui.expanded, key] });
  const toggleCompare = (name: string) => {
    const base = ui.compare.length ? ui.compare : [...top3];
    onUi({ compare: base.includes(name) ? base.filter((n) => n !== name) : [...base, name] });
  };

  return (
    <>
      <div className="mb-4 rounded-lg border border-line bg-white/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg leading-tight">{p.label}</h2>
            <p className="text-xs text-ink2">
              {Object.keys(p.players).length} players · feature matrix below, then the temperament view
            </p>
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
          <Matrix
            p={p}
            sel={ui.sel}
            focused={ui.feature}
            onFocus={(fid) => onUi({ feature: fid })}
            selectedPlayer={ui.drill === 'feature' ? activePlayer : null}
            onSelectPlayer={drillVia('feature')}
          />
          <p className="mt-1.5 text-[11px] text-ink2">
            Each cell is a player’s mean for that feature; colour ranks them within the column (green = better, red =
            worse), faint = below {p.n_min} games. Headers focus a feature; click a player name for their per-game breakdown.
          </p>
          {activePlayer && ui.drill === 'feature' && (
            <div className="mt-3">
              <PlayerGames p={p} player={activePlayer} sel={ui.sel} onClose={() => { onPlayer(null); onUi({ drill: null }); }} onOpenGame={onOpenGame} />
            </div>
          )}
        </div>
        <aside className="flex min-w-0 flex-col gap-4">
          <FocusPanel p={p} fid={ui.feature} sel={ui.sel} />
        </aside>
      </div>

      {/* ── temperament view (replaces the radar) ─────────────────── */}
      <div className="mt-5 flex flex-col gap-2">
        <TraitMatrix
          p={p}
          table={tt}
          trait={ui.trait}
          onTrait={(key) => onUi({ trait: key })}
          onFeature={(fid) => onUi({ feature: fid })}
          feature={ui.feature}
          expanded={new Set(ui.expanded)}
          onToggleExpand={toggleExpand}
          player={activePlayer}
          onSelectPlayer={drillVia('trait')}
          compare={compare}
          onToggleCompare={toggleCompare}
        />
        {activePlayer && ui.drill === 'trait' && (
          <TraitPlayerGames
            p={p}
            player={activePlayer}
            table={tt}
            traitKey={ui.trait}
            sel={ui.sel}
            onClose={() => { onPlayer(null); onUi({ drill: null }); }}
            onOpenGame={onOpenGame}
          />
        )}
      </div>

      <div className="mt-5 flex flex-col gap-5">
        <PhaseColourCard p={p} sel={ui.sel} focused={ui.feature} selected={compare} />
        <FeatureScatter p={p} sel={ui.sel} />
      </div>

      <RightDrawer label="Insights">
        <WinningDNA p={p} phase={ui.sel.phase} />
        <CorrelationMatrix p={p} />
      </RightDrawer>
    </>
  );
}
