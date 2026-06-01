import type { FeatureResult, ManifestEntry, PlyIndex } from '../../engine/game';
import { CATEGORY_LABEL as CATEGORY_LABEL_RAW, HIGHER as HIGHER_RAW } from '../../engine/catalog.js';

const CATEGORY_LABEL = CATEGORY_LABEL_RAW as Record<string, string>;
const HIGHER = HIGHER_RAW as Record<string, string>;
type Meta = Record<string, ManifestEntry>;
const SIDE_LABEL: Record<string, string> = { w: 'White', b: 'Black', shared: 'Both' };
const dirOf = (id: string, meta: Meta) => HIGHER[id] || meta[id]?.higher || 'neutral';
const fmtNum = (x: number | null | undefined) =>
  x == null ? '' : Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100);
const fmtValue = (id: string, fr?: FeatureResult) =>
  !fr || fr.value == null ? '–' : id === 'KSF.castle' ? (fr.value ? 'yes' : 'no') : fmtNum(fr.value);

function whyNote(name: string, side: string, fr: FeatureResult, higher: string): string {
  if (fr.delta == null) return '';
  const prev = (fr.value ?? 0) - fr.delta;
  const sign = fr.delta >= 0 ? '+' : '';
  const tech = `${fmtNum(prev)}→${fmtNum(fr.value)} (Δ${sign}${fmtNum(fr.delta)})`;
  if (fr.delta === 0) return tech;
  const who = side === 'shared' ? 'Board' : `${SIDE_LABEL[side]}’s ${name.toLowerCase()}`;
  const dir = fr.delta > 0 ? 'rose' : 'fell';
  let tail = '.';
  if (higher === 'good') tail = fr.delta > 0 ? ' — an improvement.' : ' — a step back.';
  else if (higher === 'bad') tail = fr.delta > 0 ? ' — a warning sign.' : ' — relief.';
  return `${who} ${dir} by ${fmtNum(Math.abs(fr.delta))}${tail}  ${tech}`;
}

export function ExplainPanel({ byId, meta, selectedId }: { byId: PlyIndex; meta: Meta; selectedId: string }) {
  const m = meta[selectedId];
  if (!m) return <p className="text-xs text-ink2">Select a feature to see what it means and why it moved.</p>;
  const higher = dirOf(selectedId, meta);
  const rows = byId[selectedId] || {};
  const sides = rows.shared ? ['shared'] : ['w', 'b'];
  const notes: string[] = [];
  let unavailable = false;

  return (
    <div className="rounded-md border border-line bg-white p-3">
      <div className="flex items-center gap-2">
        <span className="font-display text-sm font-medium">{m.name}</span>
        {m.tier && <span className="rounded bg-paper2 px-1 text-[10px] text-ink2">{m.tier}</span>}
        <span className="text-[11px] text-ink2">{CATEGORY_LABEL[m.category] || m.category}</span>
      </div>
      {m.description && <p className="mt-1 text-xs leading-snug text-ink2">{m.description}</p>}
      {m.computation && <p className="mt-0.5 text-[11px] italic leading-snug text-ink2/80">{m.computation}</p>}
      <div className="mt-2 flex gap-4">
        {sides.map((side) => {
          const fr = rows[side];
          if (!fr) return null;
          if (fr.status && fr.status !== 'ok') unavailable = true;
          const note = whyNote(m.name, side, fr, higher);
          if (note) notes.push(`${SIDE_LABEL[side]}: ${note}`);
          const col = side === 'w' ? 'text-w' : side === 'b' ? 'text-b' : 'text-ink2';
          return (
            <div key={side} className="text-sm">
              <span className={`mr-1 text-[11px] ${col}`}>{SIDE_LABEL[side]}</span>
              <span className="font-mono">{fmtValue(selectedId, fr)}</span>
            </div>
          );
        })}
      </div>
      {notes.length > 0 && (
        <div className="mt-2">
          <div className="text-[11px] font-semibold text-ink2">Why it changed this move</div>
          <ul className="mt-0.5 list-disc pl-4 text-xs leading-snug text-ink2">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      {unavailable && <p className="mt-2 text-[11px] text-w">Needs eval/clock data — not available for this game.</p>}
    </div>
  );
}
