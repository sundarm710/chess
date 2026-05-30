import type { SliceSel } from '../lib/profile';
import { PHASE_LABEL } from '../lib/profile';

interface Props {
  sel: SliceSel;
  onChange: (sel: SliceSel) => void;
  emitCross: boolean;
}

const sel =
  'rounded-md border border-line bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-w/40';

export function FilterBar({ sel: cur, onChange, emitCross }: Props) {
  const approx = cur.phase !== 'all' && cur.color !== 'all' && !emitCross;
  return (
    <div className="flex flex-wrap items-center gap-4 text-sm text-ink2">
      <label className="flex items-center gap-2">
        Phase
        <select
          className={sel}
          value={cur.phase}
          onChange={(e) => onChange({ ...cur, phase: e.target.value as SliceSel['phase'] })}
        >
          <option value="all">All phases</option>
          <option value="opening">Opening</option>
          <option value="middlegame">Middlegame</option>
          <option value="endgame">Endgame</option>
        </select>
      </label>
      <label className="flex items-center gap-2">
        Colour
        <select
          className={sel}
          value={cur.color}
          onChange={(e) => onChange({ ...cur, color: e.target.value as SliceSel['color'] })}
        >
          <option value="all">Both colours</option>
          <option value="w">White</option>
          <option value="b">Black</option>
        </select>
      </label>
      <span className="font-semibold text-ink">
        {cur.phase === 'all' ? 'All phases' : PHASE_LABEL[cur.phase]} ·{' '}
        {cur.color === 'all' ? 'both colours' : cur.color === 'w' ? 'White' : 'Black'}
      </span>
      {approx && (
        <span className="italic text-w">
          approx — no phase×colour data this field; showing the {PHASE_LABEL[cur.phase]} marginal
        </span>
      )}
    </div>
  );
}
