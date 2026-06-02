import { Fragment, useMemo, useState } from 'react';
import { cellColor, goodness } from '../lib/profile';
import type { Metric, MetricGroup, PrefixCol, Range } from '../lib/metrics';

const fmt = (v: number | null) =>
  v == null || !Number.isFinite(v) ? '–' : Number.isInteger(v) ? String(v) : (Math.round(v * 100) / 100).toFixed(2);

interface Sort {
  key: string; // prefix id OR metric id
  dir: 1 | -1;
}

/** A players × metrics table: red→green cells (goodness within each column), grouped &
 *  optionally-expandable columns, every value column sortable (desc on first click),
 *  sticky player + header. Drives BOTH the feature matrix and the temperament matrix. */
export function MetricMatrix({
  names,
  prefix,
  groups,
  ranges,
  nMin,
  focused,
  onFocus,
  initialSortKey,
  expandable = false,
  expanded,
  onToggleExpand,
  player,
  onSelectPlayer,
  compare,
  onToggleCompare,
}: {
  names: string[]; // players in baseline (score) order
  prefix: PrefixCol[];
  groups: MetricGroup[];
  ranges: Map<string, Range>;
  nMin: number;
  focused: string | null; // highlighted/sorted column (mirrors persisted focus)
  onFocus: (metricId: string) => void;
  initialSortKey?: string;
  expandable?: boolean;
  expanded?: Set<string>;
  onToggleExpand?: (groupKey: string) => void;
  player?: string | null;
  onSelectPlayer?: (name: string) => void;
  compare?: Set<string>;
  onToggleCompare?: (name: string) => void;
}) {
  const [sort, setSort] = useState<Sort>({ key: initialSortKey ?? 'score', dir: -1 });

  // visible columns per group: lead (if any) + members (always for non-collapsible groups)
  const view = useMemo(
    () =>
      groups.map((g) => {
        const collapsible = expandable && !!g.lead;
        const showMembers = !collapsible || (expanded?.has(g.key) ?? false);
        const cols: Metric[] = [...(g.lead ? [g.lead] : []), ...(showMembers ? g.members : [])];
        return { g, collapsible, cols };
      }),
    [groups, expandable, expanded],
  );

  const sortValue = (name: string): number | null => {
    const pc = prefix.find((c) => c.id === sort.key);
    if (pc) return pc.value(name);
    for (const g of groups) {
      if (g.lead?.id === sort.key) return g.lead.player(name)?.mean ?? null;
      const m = g.members.find((x) => x.id === sort.key);
      if (m) return m.player(name)?.mean ?? null;
    }
    return null;
  };
  const rows = useMemo(() => {
    return [...names].sort((a, b) => {
      const av = sortValue(a), bv = sortValue(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names, sort, groups, prefix]);

  const clickCol = (key: string, focus?: () => void) => {
    focus?.();
    setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }));
  };
  const arrow = (key: string) => (sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');
  const headCls = 'cursor-pointer select-none whitespace-nowrap border-b border-line bg-paper2 px-2 py-1.5 font-semibold';
  const isHot = (id: string) => id === focused || id === sort.key;

  const colorCell = (m: Metric, v: number | null, n: number) => {
    const low = v == null || n < nMin;
    const rg = ranges.get(m.id);
    const g = low || !rg ? null : goodness(v, rg.lo, rg.hi, m.higher);
    return { low, style: g == null ? undefined : ({ background: cellColor(g), display: 'block', margin: '-4px -8px', padding: '4px 8px' } as const) };
  };

  return (
    <div className="max-h-[74vh] overflow-auto rounded-lg border border-line bg-white">
      <table className="border-collapse text-xs">
        <thead className="sticky top-0 z-20">
          {/* group header row */}
          <tr>
            <th className="sticky left-0 z-30 border-b border-line bg-paper2" />
            {prefix.map((c) => (
              <th key={c.id} className="border-b border-line bg-paper2" />
            ))}
            {view.map(({ g, collapsible, cols }) => (
              <th
                key={g.key}
                colSpan={cols.length}
                className="border-b border-l border-line bg-paper2 px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-ink2"
                title={g.blurb}
              >
                {collapsible && (
                  <button
                    type="button"
                    onClick={() => onToggleExpand?.(g.key)}
                    className="mr-1 text-ink2 hover:text-ink"
                    title={expanded?.has(g.key) ? 'Collapse member features' : 'Show member features'}
                  >
                    {expanded?.has(g.key) ? '▾' : '▸'}
                  </button>
                )}
                {g.label}
              </th>
            ))}
          </tr>
          {/* column header row */}
          <tr>
            <th
              className={`${headCls} sticky left-0 z-30 text-left`}
              onClick={() => clickCol('score')}
              title="Players — sorted by points; click any column to re-sort"
            >
              Player
            </th>
            {prefix.map((c) => (
              <th key={c.id} className={`${headCls} text-right text-ink2`} title={c.desc} onClick={() => clickCol(c.id)}>
                {c.label}{arrow(c.id)}
              </th>
            ))}
            {view.map(({ g, cols }) => (
              <Fragment key={g.key}>
                {cols.map((m, i) => (
                  <th
                    key={m.id}
                    onClick={() => clickCol(m.id, () => onFocus(m.id))}
                    title={m.desc}
                    className={[
                      headCls,
                      'text-center',
                      i === 0 ? 'border-l border-line' : '',
                      m.aggregate ? 'text-[11px]' : 'text-[10px]',
                      isHot(m.id) ? 'text-w underline' : 'text-ink2',
                    ].join(' ')}
                  >
                    {m.label}{arrow(m.id)}
                  </th>
                ))}
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((name) => {
            const sel = name === player;
            return (
              <tr key={name} className={sel ? 'bg-paper' : 'hover:bg-paper/60'}>
                <td className={`sticky left-0 z-10 whitespace-nowrap border-b border-line/60 px-2 py-1 text-left ${sel ? 'bg-paper' : 'bg-white'}`}>
                  <span className="inline-flex items-center gap-1.5">
                    {onToggleCompare && (
                      <input
                        type="checkbox"
                        checked={compare?.has(name) ?? false}
                        onChange={() => onToggleCompare(name)}
                        onClick={(e) => e.stopPropagation()}
                        title="Add to the Phase & colour comparison"
                        className="h-3 w-3 shrink-0 accent-[var(--color-b)]"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => onSelectPlayer?.(name)}
                      title="Show this player's per-game breakdown"
                      className={`text-left hover:underline ${sel ? 'font-semibold text-w' : ''}`}
                    >
                      {name}
                    </button>
                  </span>
                </td>
                {prefix.map((c) => (
                  <td key={c.id} className="whitespace-nowrap border-b border-line/60 px-2 py-1 text-right tabular-nums text-ink2" title={c.title?.(name)}>
                    {c.fmt(c.value(name))}
                  </td>
                ))}
                {view.map(({ g, cols }) => (
                  <Fragment key={g.key}>
                    {cols.map((m, i) => {
                      const cell = m.player(name);
                      const v = cell?.mean ?? null;
                      const { low, style } = colorCell(m, v, cell?.n ?? 0);
                      return (
                        <td
                          key={m.id}
                          className={[
                            'whitespace-nowrap border-b border-line/60 px-2 py-1 text-right tabular-nums',
                            i === 0 ? 'border-l border-line' : '',
                            isHot(m.id) ? 'ring-1 ring-inset ring-w/30' : '',
                          ].join(' ')}
                        >
                          <span className={low ? 'opacity-40' : ''} style={style}>
                            {low ? '–' : fmt(v)}{cell?.approx ? '·' : ''}
                          </span>
                        </td>
                      );
                    })}
                  </Fragment>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
