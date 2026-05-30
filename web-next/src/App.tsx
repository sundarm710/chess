import { useState } from 'react';
import type { LibraryEntry, Profile } from './types';
import type { SliceSel } from './lib/profile';
import { useJson } from './hooks/useFetch';
import { FilterBar } from './components/FilterBar';
import { Matrix } from './components/Matrix';
import { CorrelationChart } from './components/CorrelationChart';

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

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-6">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight text-ink">
            Positional Feature Stepper{' '}
            <span className="rounded bg-ink px-1.5 py-0.5 align-middle text-[10px] font-semibold text-paper">
              web-next
            </span>
          </h1>
          <p className="text-sm text-ink2">
            Vite · React · TypeScript · Tailwind · TanStack Table · react-chartjs-2 — spike
          </p>
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
        <div className="flex flex-col gap-5">
          <div className="rounded-lg border border-line bg-white/60 p-3">
            <h2 className="mb-1 font-display text-lg">{p.label}</h2>
            <p className="mb-3 text-xs text-ink2">
              {Object.keys(p.players).length} players · click a column to sort &amp; focus a feature
            </p>
            <FilterBar sel={sel} onChange={setSel} emitCross={p.emit_cross} />
          </div>

          <Matrix p={p} sel={sel} focused={focused} onFocus={setFocused} />

          <section className="rounded-lg border border-line bg-white p-3.5">
            <h3 className="font-display text-base">What wins — feature ↔ result</h3>
            <p className="mb-2 text-xs text-ink2">
              Correlation of each feature with the game result (win 1 · draw 0.5 · loss 0), pooled
              across games. + means it tracks winning. Follows the phase filter
              {sel.phase === 'all' ? '' : ` (${sel.phase})`}. A field-level signal, not causal.
            </p>
            <CorrelationChart p={p} phase={sel.phase} />
          </section>
        </div>
      )}
    </div>
  );
}
