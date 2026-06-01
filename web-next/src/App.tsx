import { useState } from 'react';
import type { LibraryEntry } from './types';
import { useJson } from './hooks/useFetch';
import { ProfilesView } from './views/ProfilesView';
import { GameView } from './views/GameView';

interface Library {
  tournaments: LibraryEntry[];
}
type View = 'game' | 'profiles';

function parseHash(): { view: View; slug: string; gameId?: string; ply?: number } | null {
  const h = window.location.hash || '';
  let m = h.match(/^#profiles\/([\w-]+)$/);
  if (m) return { view: 'profiles', slug: m[1] };
  m = h.match(/^#([\w-]+__r\d+b\d+)(?:@(\d+))?$/);
  if (m) return { view: 'game', slug: m[1].split('__')[0], gameId: m[1], ply: Number(m[2] || 0) };
  return null;
}

export default function App() {
  const lib = useJson<Library>('./data/library.json');
  const initial = parseHash();
  const [view, setView] = useState<View>(initial?.view ?? 'game');
  const [slug, setSlug] = useState(initial?.slug ?? 'candidates-2026-open');
  const [deepGame] = useState(initial?.gameId);
  const [deepPly] = useState(initial?.ply ?? 0);

  const tournaments = lib.data?.tournaments ?? [];

  const switchView = (v: View) => {
    setView(v);
    if (v === 'profiles') {
      window.location.hash = `#profiles/${slug === 'custom' ? tournaments[0]?.slug ?? '' : slug}`;
      if (slug === 'custom') setSlug(tournaments[0]?.slug ?? slug);
    }
  };

  const tabBtn = (v: View) =>
    `px-3 py-1 text-sm ${view === v ? 'bg-ink text-paper' : 'bg-paper2 text-ink2'}`;

  return (
    <div className="mx-auto max-w-[1320px] px-5 py-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-2">
            <h1 className="font-display text-xl font-medium tracking-tight text-ink">Positional Feature Stepper</h1>
            <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-paper">web-next</span>
          </div>
          <div className="inline-flex overflow-hidden rounded-md border border-line">
            <button type="button" className={tabBtn('game')} onClick={() => switchView('game')}>
              Game
            </button>
            <button type="button" className={tabBtn('profiles')} onClick={() => switchView('profiles')}>
              Profiles
            </button>
          </div>
        </div>
        <select
          className="rounded-md border border-line bg-white px-2 py-1 text-sm"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            if (view === 'profiles') window.location.hash = `#profiles/${e.target.value}`;
          }}
        >
          {tournaments.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.label}
            </option>
          ))}
          {view === 'game' && <option value="custom">Custom PGN…</option>}
        </select>
      </header>

      {view === 'profiles' ? (
        <ProfilesView slug={slug === 'custom' ? tournaments[0]?.slug ?? '' : slug} />
      ) : (
        <GameView
          key={slug}
          slug={slug}
          initialGameId={deepGame}
          initialPly={deepPly}
          onSelectGame={(id, ply) => {
            window.location.hash = `#${id}@${ply}`;
          }}
        />
      )}
    </div>
  );
}
