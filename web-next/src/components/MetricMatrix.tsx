import { Fragment, useMemo } from 'react';
import { cellColor, goodness } from '../lib/profile';
import type { Metric, MetricGroup, PrefixCol, Range } from '../lib/metrics';

const fmt = (v: number | null) =>
  v == null || !Number.isFinite(v) ? '–' : Number.isInteger(v) ? String(v) : (Math.round(v * 100) / 100).toFixed(2);

/** A players × metrics table: red→green cells (goodness within each column), grouped &
 *  optionally-expandable columns. The table is ALWAYS in points order — clicking a column
 *  only *focuses* it (drives the ranking panel to the right), never re-sorts. Drives both
 *  the feature matrix and the temperament matrix. */
export function MetricMatrix({
  names,
  prefix,
  groups,
  ranges,
  nMin,
  focused,
  onFocus,
  expandable = false,
  expanded,
  onToggleExpand,
  player,
  onSelectPlayer,
}: {
  names: string[]; // players in baseline (points) order — the fixed row order
  prefix: PrefixCol[];
  groups: MetricGroup[];
  ranges: Map<string, Range>;
  nMin: number;
  focused: string | null; // highlighted column id (mirrors persisted focus)
  onFocus: (metricId: string) => void;
  expandable?: boolean;
  expanded?: Set<string>;
  onToggleExpand?: (groupKey: string) => void;
  player?: string | null;
  onSelectPlayer?: (name: string) => void;
}) {
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

  const headCls = 'whitespace-nowrap border-b border-line bg-paper2 px-2 py-1.5 font-semibold';
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
            <th className={`${headCls} sticky left-0 z-30 text-left text-ink2`} title="Players — fixed in points order">Player</th>
            {prefix.map((c) => (
              <th key={c.id} className={`${headCls} text-right text-ink2`} title={c.desc}>{c.label}</th>
            ))}
            {view.map(({ g, cols }) => (
              <Fragment key={g.key}>
                {cols.map((m, i) => (
                  <th
                    key={m.id}
                    onClick={() => onFocus(m.id)}
                    title={m.desc}
                    className={[
                      headCls,
                      'cursor-pointer select-none text-center',
                      i === 0 ? 'border-l border-line' : '',
                      m.aggregate ? 'text-[11px]' : 'text-[10px]',
                      m.id === focused ? 'text-w underline' : 'text-ink2',
                    ].join(' ')}
                  >
                    {m.label}
                  </th>
                ))}
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {names.map((name) => {
            const sel = name === player;
            return (
              <tr key={name} className={sel ? 'bg-paper' : 'hover:bg-paper/60'}>
                <td className={`sticky left-0 z-10 whitespace-nowrap border-b border-line/60 px-2 py-1 text-left ${sel ? 'bg-paper' : 'bg-white'}`}>
                  <button
                    type="button"
                    onClick={() => onSelectPlayer?.(name)}
                    title="Show this player's per-game breakdown"
                    className={`text-left hover:underline ${sel ? 'font-semibold text-w' : ''}`}
                  >
                    {name}
                  </button>
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
                            m.id === focused ? 'ring-1 ring-inset ring-w/30' : '',
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
