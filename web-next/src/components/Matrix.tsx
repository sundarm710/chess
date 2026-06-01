import { useMemo, useState } from 'react';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { Profile } from '../types';
import {
  type FightStats,
  type SliceSel,
  availableFeatures,
  cellColor,
  columnRange,
  featuresByCategory,
  fightStats,
  goodness,
  isOk,
  playersByScore,
  sliceValue,
} from '../lib/profile';

interface Row {
  name: string;
  score: number;
  perf: number | null;
  fight: FightStats;
  vals: Record<string, { mean: number; n: number; approx?: boolean }>;
}

const pct = (v: number | null | undefined) => (v == null ? '–' : `${Math.round(v * 100)}%`);

const fmt = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '–' : Number.isInteger(v) ? String(v) : (Math.round(v * 100) / 100).toFixed(2);

export function Matrix({
  p,
  sel,
  focused,
  onFocus,
  selectedPlayer,
  onSelectPlayer,
}: {
  p: Profile;
  sel: SliceSel;
  focused: string | null;
  onFocus: (fid: string) => void;
  selectedPlayer?: string | null;
  onSelectPlayer?: (name: string) => void;
}) {
  const nMin = p.n_min;
  const feats = useMemo(() => availableFeatures(p), [p]);
  const cats = useMemo(() => featuresByCategory(p), [p]);
  const catStart = useMemo(() => new Set(cats.map((g) => g.ids[0])), [cats]);
  const ranges = useMemo(
    () => Object.fromEntries(feats.map((fid) => [fid, columnRange(p, fid, sel, nMin)])),
    [p, feats, sel, nMin],
  );

  const rows = useMemo<Row[]>(
    () =>
      playersByScore(p).map(([name, d]) => ({
        name,
        score: d.score,
        perf: d.performance_elo,
        fight: fightStats(d),
        vals: Object.fromEntries(feats.map((fid) => [fid, sliceValue(d, fid, sel)])),
      })),
    [p, feats, sel],
  );

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    const base: ColumnDef<Row>[] = [
      {
        id: 'name',
        header: 'Player',
        accessorKey: 'name',
        cell: (c) => <span className="font-medium">{c.getValue<string>()}</span>,
      },
      { id: 'score', header: 'Pts', accessorKey: 'score', cell: (c) => fmt(c.getValue<number>()) },
      { id: 'perf', header: 'TPR', accessorFn: (r) => r.perf ?? undefined, cell: (c) => fmt(c.getValue<number>()) },
      // Fight & defence (whole-game outcome stats; independent of the phase/colour filter).
      {
        id: 'resil', header: 'Resil', accessorFn: (r) => r.fight.resilience ?? undefined, sortUndefined: 'last',
        cell: (c) => <span title={`saved ${c.row.original.fight.nBehind} games behind ≥3`}>{pct(c.row.original.fight.resilience)}</span>,
      },
      {
        id: 'conv', header: 'Conv', accessorFn: (r) => r.fight.conversion ?? undefined, sortUndefined: 'last',
        cell: (c) => <span title={`from ${c.row.original.fight.nAhead} games ahead ≥3`}>{pct(c.row.original.fight.conversion)}</span>,
      },
      { id: 'cmbk', header: 'CmBk', accessorFn: (r) => r.fight.comeback, cell: (c) => c.getValue<number>() || '–' },
      { id: 'clps', header: 'Clps', accessorFn: (r) => r.fight.collapse, cell: (c) => c.getValue<number>() || '–' },
    ];
    const featCol = (fid: string): ColumnDef<Row> => ({
      id: fid,
      header: p.meta[fid]?.name ?? fid,
      accessorFn: (r) => (isOk(r.vals[fid]) ? r.vals[fid].mean : undefined),
      enableSorting: false, // clicking a feature focuses it on the right; never re-sorts the field
      cell: (c) => {
        const s = c.row.original.vals[fid];
        const low = !isOk(s) || s.n < nMin;
        const g = low ? null : goodness(s.mean, ranges[fid].lo, ranges[fid].hi, p.meta[fid]?.higher ?? 'neutral');
        return (
          <span
            className={low ? 'opacity-40' : ''}
            style={g == null ? undefined : { background: cellColor(g), display: 'block', margin: '-4px -8px', padding: '4px 8px' }}
          >
            {low ? '–' : fmt(s.mean)}
          </span>
        );
      },
    });
    const groups: ColumnDef<Row>[] = cats.map((g) => ({
      id: `grp_${g.cat}`,
      header: g.label,
      columns: g.ids.map(featCol),
    }));
    return [...base, ...groups];
  }, [cats, p, ranges, nMin]);

  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="max-h-[74vh] overflow-auto rounded-lg border border-line bg-white">
      <table className="border-collapse text-xs">
        <thead className="sticky top-0 z-20">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const col = h.column;
                const isName = col.id === 'name';
                const stickyL = isName ? 'sticky left-0 z-30 ' : '';
                if (h.isPlaceholder) {
                  return <th key={h.id} colSpan={h.colSpan} className={`${stickyL}border-b border-line bg-paper2`} />;
                }
                if (h.subHeaders.length > 0) {
                  // category group header
                  return (
                    <th
                      key={h.id}
                      colSpan={h.colSpan}
                      className="border-b border-l border-line bg-paper2 px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-ink2"
                    >
                      {flexRender(col.columnDef.header, h.getContext())}
                    </th>
                  );
                }
                const isFeat = !!p.meta[col.id];
                const sorted = col.getIsSorted();
                return (
                  <th
                    key={h.id}
                    colSpan={h.colSpan}
                    onClick={() => {
                      if (isFeat) onFocus(col.id); // focus only — keep the field sorted by points
                      else col.toggleSorting();
                    }}
                    title={p.meta[col.id]?.description ?? ''}
                    className={[
                      stickyL,
                      'cursor-pointer select-none whitespace-nowrap border-b border-line bg-paper2 px-2 py-1.5 text-left font-semibold',
                      catStart.has(col.id) ? 'border-l border-line' : '',
                      col.id === focused ? 'text-w underline' : 'text-ink2',
                    ].join(' ')}
                  >
                    {flexRender(col.columnDef.header, h.getContext())}
                    {sorted ? (sorted === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const isSelPlayer = row.original.name === selectedPlayer;
            return (
              <tr key={row.id} className={isSelPlayer ? 'bg-paper' : 'hover:bg-paper/60'}>
                {row.getVisibleCells().map((cell) => {
                  const isName = cell.column.id === 'name';
                  return (
                    <td
                      key={cell.id}
                      onClick={isName ? () => onSelectPlayer?.(row.original.name) : undefined}
                      title={isName ? 'Show this player’s per-game breakdown' : undefined}
                      className={[
                        'whitespace-nowrap border-b border-line/60 px-2 py-1 text-right tabular-nums',
                        isName ? `sticky left-0 z-10 cursor-pointer text-left ${isSelPlayer ? 'bg-paper font-semibold text-w' : 'bg-white'}` : '',
                        catStart.has(cell.column.id) ? 'border-l border-line' : '',
                        cell.column.id === focused ? 'ring-1 ring-inset ring-w/30' : '',
                      ].join(' ')}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
