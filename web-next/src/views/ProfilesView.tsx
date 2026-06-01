import { useEffect, useMemo, useState } from 'react';
import type { Profile } from '../types';
import { type SliceSel, playersByScore, takeaway } from '../lib/profile';
import { useJson } from '../hooks/useFetch';
import { FilterBar } from '../components/FilterBar';
import { Matrix } from '../components/Matrix';
import { WinningDNA } from '../components/WinningDNA';
import { FocusPanel } from '../components/FocusPanel';
import { PlayerGames } from '../components/PlayerGames';
import { PlayerRadar } from '../components/PlayerRadar';
import { FeatureScatter } from '../components/FeatureScatter';
import { PhaseColourCard } from '../components/PhaseColourCard';

export function ProfilesView({ slug }: { slug: string }) {
  const { data: p, loading, error } = useJson<Profile>(`./data/profiles/${slug}.json`);
  const [sel, setSel] = useState<SliceSel>({ phase: 'all', color: 'all' });
  const [focused, setFocused] = useState<string | null>('SPC.space');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drillPlayer, setDrillPlayer] = useState<string | null>(null);

  // Default the radar to the top 3 by score whenever a new profile loads.
  useEffect(() => {
    if (p) setSelected(new Set(playersByScore(p).slice(0, 3).map(([n]) => n)));
  }, [p]);

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const tk = useMemo(() => (p ? takeaway(p, sel.phase) : null), [p, sel.phase]);

  if (loading) return <p className="text-ink2">Loading profile…</p>;
  if (error || !p) return <p className="text-w">Couldn’t load {slug}: {error ?? 'no data'}</p>;

  return (
    <>
      <div className="mb-4 rounded-lg border border-line bg-white/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg leading-tight">{p.label}</h2>
            <p className="text-xs text-ink2">
              {Object.keys(p.players).length} players · click a feature column to focus it
            </p>
          </div>
          <FilterBar sel={sel} onChange={setSel} emitCross={p.emit_cross} />
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
            sel={sel}
            focused={focused}
            onFocus={setFocused}
            selectedPlayer={drillPlayer}
            onSelectPlayer={(name) => setDrillPlayer((cur) => (cur === name ? null : name))}
          />
          <p className="mt-1.5 text-[11px] text-ink2">
            Each cell is a player’s mean for that feature; colour ranks them within the column (green = better, red =
            worse), faint = below {p.n_min} games. Headers sort; click a player name for their per-game breakdown.
          </p>
        </div>
        <aside className="flex min-w-0 flex-col gap-4">
          <WinningDNA p={p} phase={sel.phase} />
          <FocusPanel p={p} fid={focused} sel={sel} />
        </aside>
      </div>

      {drillPlayer && <PlayerGames p={p} player={drillPlayer} sel={sel} onClose={() => setDrillPlayer(null)} />}

      <div className="mt-5 flex flex-col gap-5">
        <PlayerRadar p={p} sel={sel} selected={selected} onToggle={toggle} />
        <PhaseColourCard p={p} sel={sel} focused={focused} selected={selected} />
        <FeatureScatter p={p} sel={sel} />
      </div>
    </>
  );
}
