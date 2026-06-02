import { Fragment, useMemo, useState } from 'react';
import type { Profile } from '../types';
import { tempColor, tempInk } from '../lib/temperament';
import type { TraitRow, TraitTable } from '../lib/traits';

const z1 = (z: number | null) => (z == null ? '' : `${z >= 0 ? '+' : ''}${z.toFixed(1)}`);
const fmtPerf = (v: number | null) => (v == null ? '–' : String(Math.round(v)));

/** What column drives the ordering. `score`/`perf` are plain; a trait or feature key
 *  sorts by its field-relative z (and is mirrored into the persisted focus). */
type SortKey = { kind: 'score' | 'perf' | 'trait' | 'feature'; key: string };

function ZCell({ z, n, total, big, title, onClick }: { z: number | null; n?: number; total?: number; big?: boolean; title: string; onClick: () => void }) {
  const faint = n != null && total != null && n < total; // some members missing this slice
  return (
    <td className={`border-b border-line/60 p-0 ${big ? 'border-l border-line' : ''}`}>
      <button
        type="button"
        title={title}
        onClick={onClick}
        className={`flex h-full w-full items-center justify-center px-2 font-mono tabular-nums ${big ? 'py-[7px] text-[11px]' : 'py-[7px] text-[10px]'} ${faint ? 'opacity-55' : ''} hover:outline hover:outline-1 hover:-outline-offset-1 hover:outline-ink/40`}
        style={{ background: tempColor(z), color: tempInk(z) }}
      >
        {z == null ? '–' : Math.abs(z) >= 0.55 ? z1(z) : '·'}
      </button>
    </td>
  );
}

export function TraitMatrix({
  p,
  table,
  trait,
  onTrait,
  onFeature,
  feature,
  expanded,
  onToggleExpand,
  player,
  onSelectPlayer,
  compare,
  onToggleCompare,
}: {
  p: Profile;
  table: TraitTable;
  trait: string; // focused trait key (persisted)
  onTrait: (key: string) => void;
  onFeature: (fid: string) => void; // focusing a member feature (drives FocusPanel)
  feature: string | null;
  expanded: Set<string>;
  onToggleExpand: (key: string) => void;
  player: string | null;
  onSelectPlayer: (name: string) => void;
  compare: Set<string>;
  onToggleCompare: (name: string) => void;
}) {
  const { traits, rows } = table;
  const [sort, setSort] = useState<SortKey>({ kind: 'trait', key: trait });
  const [dir, setDir] = useState<1 | -1>(-1); // default: most-of-trait first

  const clickHeader = (k: SortKey, focus?: () => void) => {
    focus?.();
    setDir((d) => (sort.kind === k.kind && sort.key === k.key ? (d === 1 ? -1 : 1) : -1));
    setSort(k);
  };

  const sortVal = (r: TraitRow): number | null => {
    switch (sort.kind) {
      case 'score': return r.score;
      case 'perf': return r.perf;
      case 'trait': return r.traits[sort.key]?.z ?? null;
      case 'feature': return r.feats[sort.key] ?? null;
    }
  };
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = sortVal(a), bv = sortVal(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls always last
      if (bv == null) return -1;
      return (av - bv) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort, dir]);

  const arrow = (k: SortKey) => (sort.kind === k.kind && sort.key === k.key ? (dir === 1 ? ' ▲' : ' ▼') : '');
  const headCls = 'cursor-pointer select-none whitespace-nowrap border-b border-line bg-paper2 px-2 py-1.5 font-semibold';

  return (
    <section className="rounded-lg border border-line bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-3.5 py-2.5">
        <h3 className="font-display text-base">Temperament matrix</h3>
        <p className="text-[11px] text-ink2">
          each cell = field-relative z (warm = more of the trait, cool = less) · click a trait to expand &amp; sort · click
          a player for their games
        </p>
      </div>
      <div className="max-h-[70vh] overflow-auto">
        <table className="border-collapse text-xs">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className={`${headCls} sticky left-0 z-30 text-left`} onClick={() => clickHeader({ kind: 'score', key: 'score' })}>
                Player{arrow({ kind: 'score', key: 'score' })}
              </th>
              <th className={`${headCls} text-right`} onClick={() => clickHeader({ kind: 'perf', key: 'perf' })} title="Linear tournament performance rating">
                TPR{arrow({ kind: 'perf', key: 'perf' })}
              </th>
              {traits.map((t) => {
                const open = expanded.has(t.key);
                const tk: SortKey = { kind: 'trait', key: t.key };
                return (
                  <Fragment key={t.key}>
                    <th
                      className={`${headCls} border-l border-line text-center ${trait === t.key ? 'text-w underline' : 'text-ink2'}`}
                      title={t.blurb}
                      onClick={() => clickHeader(tk, () => onTrait(t.key))}
                    >
                      <span className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onToggleExpand(t.key); }}
                          className="text-[10px] text-ink2 hover:text-ink"
                          title={open ? 'Collapse member features' : 'Show member features'}
                        >
                          {open ? '▾' : '▸'}
                        </button>
                        {t.label}{arrow(tk)}
                      </span>
                    </th>
                    {open &&
                      t.members.map((mm) => {
                        const fk: SortKey = { kind: 'feature', key: mm.fid };
                        return (
                          <th
                            key={mm.fid}
                            className={`${headCls} text-center text-[10px] ${feature === mm.fid ? 'text-w underline' : 'text-ink2/80'}`}
                            title={`${mm.name}${mm.sign === -1 ? ' (inverted for this trait)' : ''} — ${p.meta[mm.fid]?.description ?? ''}`}
                            onClick={() => clickHeader(fk, () => onFeature(mm.fid))}
                          >
                            {mm.name}{mm.sign === -1 ? ' ↓' : ''}{arrow(fk)}
                          </th>
                        );
                      })}
                  </Fragment>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const isSel = r.name === player;
              return (
                <tr key={r.name} className={isSel ? 'bg-paper' : 'hover:bg-paper/60'}>
                  <td className={`sticky left-0 z-10 whitespace-nowrap border-b border-line/60 px-2 py-1 text-left ${isSel ? 'bg-paper' : 'bg-white'}`}>
                    <span className="inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={compare.has(r.name)}
                        onChange={() => onToggleCompare(r.name)}
                        onClick={(e) => e.stopPropagation()}
                        title="Add to the Phase & colour comparison"
                        className="h-3 w-3 shrink-0 accent-[var(--color-b)]"
                      />
                      <button
                        type="button"
                        onClick={() => onSelectPlayer(r.name)}
                        title="Show this player's games, sorted by the focused trait"
                        className={`text-left hover:underline ${isSel ? 'font-semibold text-w' : ''}`}
                      >
                        {r.name}
                      </button>
                    </span>
                  </td>
                  <td className="border-b border-line/60 px-2 py-1 text-right tabular-nums text-ink2">{fmtPerf(r.perf)}</td>
                  {traits.map((t) => {
                    const c = r.traits[t.key];
                    const open = expanded.has(t.key);
                    return (
                      <Fragment key={t.key}>
                        <ZCell
                          z={c?.z ?? null}
                          n={c?.n}
                          total={t.members.length}
                          big
                          title={`${r.name} · ${t.label}: ${z1(c?.z ?? null) || '–'} (field z, ${c?.n ?? 0}/${t.members.length} features)`}
                          onClick={() => clickHeader({ kind: 'trait', key: t.key }, () => onTrait(t.key))}
                        />
                        {open &&
                          t.members.map((mm) => (
                            <ZCell
                              key={mm.fid}
                              z={r.feats[mm.fid] ?? null}
                              title={`${r.name} · ${mm.name}: ${z1(r.feats[mm.fid] ?? null) || '–'} (field z${mm.sign === -1 ? ', inverted' : ''})`}
                              onClick={() => clickHeader({ kind: 'feature', key: mm.fid }, () => onFeature(mm.fid))}
                            />
                          ))}
                      </Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
