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
  type SliceSel,
  availableFeatures,
  cellColor,
  columnRange,
  goodness,
  isOk,
  playersByScore,
  sliceValue,
} from '../lib/profile';

interface Row {
  name: string;
  score: number;
  perf: number | null;
  vals: Record<string, { mean: number; n: number; approx?: boolean }>;
}

const fmt = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '–' : Number.isInteger(v) ? String(v) : (Math.round(v * 100) / 100).toFixed(2);

export function Matrix({
  p,
  sel,
  focused,
  onFocus,
}: {
  p: Profile;
  sel: SliceSel;
  focused: string | null;
  onFocus: (fid: string) => void;
}) {
  const nMin = p.n_min;
  const feats = useMemo(() => availableFeatures(p), [p]);
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
        enableSorting: true,
      },
      { id: 'score', header: 'Pts', accessorKey: 'score', cell: (c) => fmt(c.getValue<number>()) },
      { id: 'perf', header: 'TPR', accessorFn: (r) => r.perf ?? undefined, cell: (c) => fmt(c.getValue<number>()) },
    ];
    const featCols: ColumnDef<Row>[] = feats.map((fid) => ({
      id: fid,
      header: p.meta[fid]?.name ?? fid,
      accessorFn: (r) => (isOk(r.vals[fid]) ? r.vals[fid].mean : undefined),
      sortUndefined: 'last',
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
    }));
    return [...base, ...featCols];
  }, [feats, p, ranges, nMin]);

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
    <div className="max-h-[64vh] overflow-auto rounded-lg border border-line bg-white">
      <table className="border-collapse text-xs">
        <thead className="sticky top-0 z-20">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h, i) => {
                const isFeat = i > 2;
                const sorted = h.column.getIsSorted();
                return (
                  <th
                    key={h.id}
                    onClick={() => {
                      h.column.toggleSorting();
                      if (isFeat) onFocus(h.column.id);
                    }}
                    title={p.meta[h.column.id]?.description ?? ''}
                    className={[
                      'cursor-pointer select-none whitespace-nowrap border-b border-line bg-paper2 px-2 py-1.5 text-left font-semibold',
                      i === 0 ? 'sticky left-0 z-30 bg-paper2' : '',
                      h.column.id === focused ? 'text-w underline' : 'text-ink2',
                    ].join(' ')}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {sorted ? (sorted === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="hover:bg-paper/60">
              {row.getVisibleCells().map((cell, i) => (
                <td
                  key={cell.id}
                  className={[
                    'whitespace-nowrap border-b border-line/60 px-2 py-1 text-right tabular-nums',
                    i === 0 ? 'sticky left-0 z-10 bg-white text-left' : '',
                    cell.column.id === focused ? 'ring-1 ring-inset ring-w/30' : '',
                  ].join(' ')}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
