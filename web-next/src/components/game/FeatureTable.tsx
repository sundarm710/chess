import type { FeatureResult, ManifestEntry, PlyIndex } from '../../engine/game';
import { CATEGORY_LABEL as CATEGORY_LABEL_RAW, HIGHER as HIGHER_RAW, ORDER } from '../../engine/catalog.js';

const CATEGORY_LABEL = CATEGORY_LABEL_RAW as Record<string, string>;
const HIGHER = HIGHER_RAW as Record<string, string>;
type Meta = Record<string, ManifestEntry>;
const dirOf = (id: string, meta: Meta) => HIGHER[id] || meta[id]?.higher || 'neutral';

const fmtNum = (x: number | null | undefined) =>
  x == null ? '' : Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100);
const fmtValue = (id: string, fr?: FeatureResult) =>
  !fr || fr.value == null ? '–' : id === 'KSF.castle' ? (fr.value ? 'yes' : 'no') : fmtNum(fr.value);

function deltaClass(delta: number, higher: string) {
  const up = delta > 0;
  if (higher === 'good') return up ? 'text-good' : 'text-w';
  if (higher === 'bad') return up ? 'text-w' : 'text-good';
  return 'text-ink2';
}

function Delta({ fr, higher }: { fr?: FeatureResult; higher: string }) {
  if (!fr || fr.delta == null || fr.delta === 0) return <span className="ml-1 inline-block w-7" />;
  return (
    <span className={`ml-1 inline-block w-7 text-[10px] ${deltaClass(fr.delta, higher)}`}>
      {(fr.delta > 0 ? '▲' : '▼') + fmtNum(Math.abs(fr.delta))}
    </span>
  );
}

function winner(higher: string, w?: FeatureResult, b?: FeatureResult): 'w' | 'b' | null {
  if (!w || !b || higher === 'neutral' || w.value == null || b.value == null || w.value === b.value) return null;
  if (higher === 'good') return w.value > b.value ? 'w' : 'b';
  if (higher === 'bad') return w.value < b.value ? 'w' : 'b';
  return null;
}

function orderedIds(meta: Meta): string[] {
  const present = new Set(Object.keys(meta));
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of ORDER) if (present.has(id)) { ids.push(id); seen.add(id); }
  for (const id of Object.keys(meta)) if (!seen.has(id)) ids.push(id);
  return ids;
}

function grouped(meta: Meta): [string, string[]][] {
  const order: string[] = [];
  const groups: Record<string, string[]> = {};
  for (const id of orderedIds(meta)) {
    const cat = meta[id].category;
    if (!groups[cat]) { groups[cat] = []; order.push(cat); }
    groups[cat].push(id);
  }
  return order.map((cat) => [cat, groups[cat]]);
}

export function FeatureTable({
  byId,
  meta,
  selectedId,
  onSelect,
}: {
  byId: PlyIndex;
  meta: Meta;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const tally = { w: 0, b: 0 };
  const groups = grouped(meta);
  // tally pass
  for (const [, ids] of groups) {
    for (const id of ids) {
      const rows = byId[id] || {};
      if (rows.shared) continue;
      const win = winner(dirOf(id, meta), rows.w, rows.b);
      if (win === 'w') tally.w++;
      else if (win === 'b') tally.b++;
    }
  }

  const Val = ({ id, fr, higher }: { id: string; fr?: FeatureResult; higher: string }) => (
    <td className="px-1 py-0.5 text-right">
      <span className="font-mono">{fmtValue(id, fr)}</span>
      <Delta fr={fr} higher={higher} />
    </td>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 flex items-center justify-between text-xs text-ink2">
        <span>Features</span>
        <span>
          <span className="text-w">◀ {tally.w}</span> <span className="text-b">{tally.b} ▶</span>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-line bg-white">
        <table className="w-full border-collapse text-xs">
          <tbody>
            {groups.map(([cat, ids]) => (
              <FeatureGroup
                key={cat}
                cat={cat}
                ids={ids}
                byId={byId}
                meta={meta}
                selectedId={selectedId}
                onSelect={onSelect}
                Val={Val}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FeatureGroup({
  cat,
  ids,
  byId,
  meta,
  selectedId,
  onSelect,
  Val,
}: {
  cat: string;
  ids: string[];
  byId: PlyIndex;
  meta: Meta;
  selectedId: string;
  onSelect: (id: string) => void;
  Val: (props: { id: string; fr?: FeatureResult; higher: string }) => React.ReactElement;
}) {
  return (
    <>
      <tr>
        <td colSpan={4} className="bg-paper2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink2">
          {CATEGORY_LABEL[cat] || cat}
        </td>
      </tr>
      {ids.map((id) => {
        const higher = dirOf(id, meta);
        const rows = byId[id] || {};
        const sel = selectedId === id;
        return (
          <tr
            key={id}
            onClick={() => onSelect(id)}
            className={`cursor-pointer border-b border-line/50 ${sel ? 'bg-paper' : 'hover:bg-paper/60'}`}
          >
            <td className="px-2 py-0.5">{meta[id].name}</td>
            {rows.shared ? (
              <>
                <td colSpan={2} className="px-1 py-0.5 text-right text-ink2">
                  <span className="font-mono">{fmtValue(id, rows.shared)}</span>
                  <Delta fr={rows.shared} higher={higher} />
                </td>
                <td className="px-1 text-center text-ink2/50">·</td>
              </>
            ) : (
              <>
                <Val id={id} fr={rows.w} higher={higher} />
                <Val id={id} fr={rows.b} higher={higher} />
                <td className="px-1 text-center">
                  {(() => {
                    const win = winner(higher, rows.w, rows.b);
                    if (win === 'w') return <span className="text-w" title="favours White">◀</span>;
                    if (win === 'b') return <span className="text-b" title="favours Black">▶</span>;
                    return <span className="text-ink2/50">·</span>;
                  })()}
                </td>
              </>
            )}
          </tr>
        );
      })}
    </>
  );
}
