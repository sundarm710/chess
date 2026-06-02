import { Fragment } from 'react';
import type { Outcome } from '../lib/form';
import { OUTCOME_COLOR } from '../lib/form';
import type { TempCell, TempRow } from '../lib/temperament';
import { tempColor, tempInk } from '../lib/temperament';

export interface RoundHead {
  round: number;
  outcome: Outcome;
  opp: string;
  color: 'w' | 'b';
  id: string;
}

export interface Selection {
  kind: 'cluster' | 'feature';
  key: string;
}

const z1 = (z: number | null) => (z == null ? '' : `${z >= 0 ? '+' : ''}${z.toFixed(1)}`);
const num = (v: number | null) => (v == null ? '–' : Number.isInteger(v) ? String(v) : (Math.round(v * 100) / 100).toFixed(2));

function Cell({ c, title, onClick, big }: { c: TempCell; title: string; onClick: () => void; big?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`group/cell relative flex items-center justify-center rounded-[3px] font-mono tabular-nums transition-transform hover:z-10 hover:scale-[1.18] hover:ring-1 hover:ring-ink/40 ${big ? 'h-7 text-[10px]' : 'h-5 text-[9px]'}`}
      style={{ background: tempColor(c.z), color: tempInk(c.z) }}
    >
      {c.z != null && Math.abs(c.z) >= 0.75 ? z1(c.z) : ''}
    </button>
  );
}

export function TemperamentHeatmap({
  rows,
  rounds,
  expanded,
  onToggle,
  selected,
  onSelect,
  onOpenGame,
}: {
  rows: TempRow[];
  rounds: RoundHead[];
  expanded: Set<string>;
  onToggle: (key: string) => void;
  selected: Selection;
  onSelect: (s: Selection) => void;
  onOpenGame: (id: string) => void;
}) {
  const cols = `170px repeat(${rounds.length}, minmax(26px, 1fr))`;

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-max gap-x-1 gap-y-[3px]" style={{ gridTemplateColumns: cols }}>
        {/* ── header: round + result + opponent ───────────────────────── */}
        <div className="sticky left-0 z-10 bg-white" />
        {rounds.map((r) => (
          <button
            key={r.round}
            type="button"
            onClick={() => onOpenGame(r.id)}
            title={`Round ${r.round} ${r.color === 'w' ? '(White)' : '(Black)'} vs ${r.opp} — ${r.outcome}`}
            className="flex flex-col items-center gap-0.5 rounded px-0.5 pb-1 hover:bg-paper"
          >
            <span className="font-mono text-[10px] text-ink2">R{r.round}</span>
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
              style={{ background: OUTCOME_COLOR[r.outcome] }}
            >
              {r.outcome}
            </span>
            <span className="max-w-[3.2rem] truncate text-[8px] leading-tight text-ink2">
              {r.color === 'w' ? '□' : '■'} {r.opp.split(',')[0]}
            </span>
          </button>
        ))}

        {/* ── cluster rows (+ expandable member sub-rows) ─────────────── */}
        {rows.map((row) => {
          const open = expanded.has(row.key);
          const rowSel = selected.kind === 'cluster' && selected.key === row.key;
          return (
            <Fragment key={row.key}>
              <div
                className={`sticky left-0 z-[1] flex items-center gap-1 rounded bg-white pr-1 ${rowSel ? 'ring-1 ring-ink/30' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => onToggle(row.key)}
                  title={open ? 'Collapse' : 'Show member features'}
                  className="flex h-5 w-4 shrink-0 items-center justify-center text-[10px] text-ink2 hover:text-ink"
                >
                  {open ? '▾' : '▸'}
                </button>
                <button
                  type="button"
                  onClick={() => onSelect({ kind: 'cluster', key: row.key })}
                  title={row.blurb}
                  className="min-w-0 flex-1 truncate text-left text-[12px] font-semibold text-ink hover:underline"
                >
                  {row.label}
                </button>
                <span className="shrink-0 font-mono text-[9px] text-ink2/70">{row.members.length}</span>
              </div>
              {row.cells.map((c, i) => (
                <Cell
                  key={i}
                  c={c}
                  big
                  title={`R${rounds[i].round} · ${row.label} ${z1(c.z) || '–'} vs baseline (${c.n} of ${row.members.length} features)`}
                  onClick={() => onOpenGame(rounds[i].id)}
                />
              ))}

              {/* member feature sub-rows */}
              {open &&
                row.features.map((f) => {
                  const fSel = selected.kind === 'feature' && selected.key === f.fid;
                  return (
                    <Fragment key={f.fid}>
                      <button
                        type="button"
                        onClick={() => onSelect({ kind: 'feature', key: f.fid })}
                        title={`${f.fid} — ${f.higher === 'good' ? 'higher = better' : f.higher === 'bad' ? 'lower = better' : 'neutral'}${f.sign === -1 ? ' (inverted for this trait)' : ''}`}
                        className={`sticky left-0 z-[1] truncate bg-white pl-6 pr-1 text-left text-[10.5px] text-ink2 hover:underline ${fSel ? 'font-semibold text-ink' : ''}`}
                      >
                        {f.name}
                      </button>
                      {f.cells.map((c, i) => (
                        <Cell
                          key={i}
                          c={c}
                          title={`R${rounds[i].round} · ${f.name} = ${num(c.value)} (${z1(c.z) || '–'} vs baseline)`}
                          onClick={() => onOpenGame(rounds[i].id)}
                        />
                      ))}
                    </Fragment>
                  );
                })}
            </Fragment>
          );
        })}
      </div>

      {/* legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-ink2">
        <span className="flex items-center gap-1.5">
          <span className="flex h-3 w-24 overflow-hidden rounded-sm">
            {[-1.6, -1, -0.4, 0, 0.4, 1, 1.6].map((z) => (
              <span key={z} className="flex-1" style={{ background: tempColor(z) }} />
            ))}
          </span>
          <span className="font-mono">
            <span style={{ color: 'var(--color-b)' }}>damped</span> · baseline · <span style={{ color: 'var(--color-w)' }}>amplified</span>
          </span>
        </span>
        <span>each cell = trait vs this player's own tournament average (z-score)</span>
      </div>
    </div>
  );
}
