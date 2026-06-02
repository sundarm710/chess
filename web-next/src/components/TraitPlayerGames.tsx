import { useMemo } from 'react';
import type { GameRow, Profile } from '../types';
import type { SliceSel } from '../lib/profile';
import { tempColor, tempInk } from '../lib/temperament';
import { type TraitTable, gameTraitZ } from '../lib/traits';

const fmt = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '–' : Number.isInteger(v) ? String(v) : (Math.round(v * 100) / 100).toFixed(2);
const z1 = (z: number | null) => (z == null ? '–' : `${z >= 0 ? '+' : ''}${z.toFixed(2)}`);
const WDL = (s: number) => (s === 1 ? 'W' : s === 0.5 ? 'D' : 'L');

/** A player's games ranked by ONE trait (most → least of it), with the trait's member
 *  features alongside, so "which of their games were the most aggressive" is one glance. */
export function TraitPlayerGames({
  p,
  player,
  table,
  traitKey,
  sel,
  onClose,
  onOpenGame,
}: {
  p: Profile;
  player: string;
  table: TraitTable;
  traitKey: string;
  sel: SliceSel;
  onClose: () => void;
  onOpenGame?: (id: string) => void;
}) {
  const d = p.players[player];
  const trait = table.traits.find((t) => t.key === traitKey) ?? table.traits[0];

  const ranked = useMemo(() => {
    if (!d || !trait) return [];
    const rows = sel.color === 'all' ? d.game_rows : d.game_rows.filter((r) => r.color === sel.color);
    const valsOf = (r: GameRow) => (sel.phase === 'all' ? r.vals : r.phase_vals?.[sel.phase]);
    return rows
      .map((r) => ({ r, vals: valsOf(r), z: gameTraitZ(valsOf(r), trait, table.stats).z }))
      .sort((a, b) => (b.z ?? -Infinity) - (a.z ?? -Infinity));
  }, [d, trait, table, sel]);

  if (!d || !trait) return null;

  return (
    <section className="mt-3 rounded-lg border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div>
          <h3 className="font-display text-base">
            {player} <span className="text-xs font-normal text-ink2">— games by {trait.label.toLowerCase()}</span>
          </h3>
          <p className="text-[11px] text-ink2">
            ranked most → least {trait.label.toLowerCase()} (field-relative z); members shown as raw values. Click a game
            to open it.
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md border border-line px-2 py-0.5 text-xs text-ink2 hover:bg-paper2">
          Close ✕
        </button>
      </div>
      <div className="max-h-[52vh] overflow-auto">
        <table className="border-collapse text-xs">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="sticky left-0 z-30 border-b border-line bg-paper2 px-2 py-1.5 text-left font-semibold text-ink2">Game</th>
              <th className="border-b border-l border-line bg-paper2 px-2 py-1.5 text-center font-semibold text-ink2" title={trait.blurb}>
                {trait.label}
              </th>
              {trait.members.map((m) => (
                <th
                  key={m.fid}
                  className="whitespace-nowrap border-b border-line bg-paper2 px-2 py-1.5 text-right font-semibold text-ink2"
                  title={`${m.name}${m.sign === -1 ? ' (inverted for this trait)' : ''}`}
                >
                  {m.name}{m.sign === -1 ? ' ↓' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ranked.map(({ r, vals, z }) => (
              <tr
                key={r.id}
                onClick={() => onOpenGame?.(r.id)}
                className={onOpenGame ? 'cursor-pointer hover:bg-paper/60' : 'hover:bg-paper/60'}
                title={onOpenGame ? 'Open this game in the stepper' : undefined}
              >
                <td className="sticky left-0 z-10 whitespace-nowrap border-b border-line/60 bg-white px-2 py-0.5">
                  <span className="text-ink2">R{r.round}</span>{' '}
                  <span className={r.color === 'w' ? 'text-w' : 'text-b'}>{r.color === 'w' ? '□' : '■'}</span>{' '}
                  <span className={onOpenGame ? 'underline decoration-dotted underline-offset-2' : ''}>{r.opp}</span>{' '}
                  <span className="text-ink2">· {WDL(r.score)}</span>
                </td>
                <td
                  className="border-b border-l border-line/60 px-2 py-0.5 text-center font-mono tabular-nums"
                  style={{ background: tempColor(z), color: tempInk(z) }}
                >
                  {z1(z)}
                </td>
                {trait.members.map((m) => (
                  <td key={m.fid} className="whitespace-nowrap border-b border-line/60 px-2 py-0.5 text-right tabular-nums">
                    {fmt(vals?.[m.fid])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
