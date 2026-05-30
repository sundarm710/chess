import { useState } from 'react';
import type { LibraryEntry, Profile } from './types';
import { type SliceSel, takeaway } from './lib/profile';
import { useJson } from './hooks/useFetch';
import { FilterBar } from './components/FilterBar';
import { Matrix } from './components/Matrix';
import { WinningDNA } from './components/WinningDNA';
import { FocusPanel } from './components/FocusPanel';

interface Library {
  tournaments: LibraryEntry[];
}

export default function App() {
  const lib = useJson<Library>('./data/library.json');
  const [slug, setSlug] = useState('candidates-2026-open');
  const prof = useJson<Profile>(`./data/profiles/${slug}.json`);
  const [sel, setSel] = useState<SliceSel>({ phase: 'all', color: 'all' });
  const [focused, setFocused] = useState<string | null>('SPC.space');

  const tournaments = lib.data?.tournaments ?? [];
  const p = prof.data;
  const tk = p ? takeaway(p, sel.phase) : null;

  return (
    <div className="mx-auto max-w-[1320px] px-5 py-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h1 className="font-display text-xl font-medium tracking-tight text-ink">Positional Feature Stepper</h1>
          <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-paper">web-next</span>
        </div>
        <select
          className="rounded-md border border-line bg-white px-2 py-1 text-sm"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
        >
          {tournaments.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.label}
            </option>
          ))}
        </select>
      </header>

      {prof.loading && <p className="text-ink2">Loading profile…</p>}
      {prof.error && (
        <p className="text-w">
          Couldn’t load {slug}: {prof.error}
        </p>
      )}

      {p && (
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
              <Matrix p={p} sel={sel} focused={focused} onFocus={setFocused} />
              <p className="mt-1.5 text-[11px] text-ink2">
                Each cell is a player’s mean for that feature; colour ranks them within the column
                (green = better, red = worse), faint = below {p.n_min} games. Headers sort.
              </p>
            </div>
            <aside className="flex min-w-0 flex-col gap-4">
              <WinningDNA p={p} phase={sel.phase} />
              <FocusPanel p={p} fid={focused} sel={sel} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
