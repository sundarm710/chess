import type { SideFeats } from '../../engine/game';

/** Running comparison: exposure events, avg space, worst deficit + a plain reading. */
export function Aggregates({ feats, upto }: { feats: SideFeats[]; upto: number }) {
  const agg = { w: { exp: 0, spSum: 0, spN: 0, def: 0 }, b: { exp: 0, spSum: 0, spN: 0, def: 0 } };
  for (let i = 1; i <= upto; i++) {
    const mover = i % 2 === 1 ? 'w' : 'b';
    if (feats[i][mover].hang_val > feats[i - 1][mover].hang_val) agg[mover].exp++;
    agg[mover].spSum += feats[i][mover].space;
    agg[mover].spN++;
    for (const c of ['w', 'b'] as const) {
      const d = feats[i][c === 'w' ? 'b' : 'w'].mat - feats[i][c].mat;
      if (d > agg[c].def) agg[c].def = d;
    }
  }
  const avg = (o: { spSum: number; spN: number }) => (o.spN ? (o.spSum / o.spN).toFixed(1) : '0');

  let read: string;
  if (upto === 0) {
    read = 'Step through the game to accumulate the comparison.';
  } else {
    const diff = feats[upto].w.mat - feats[upto].b.mat;
    const bigW = agg.w.def >= 4;
    const bigB = agg.b.def >= 4;
    if (bigB && diff >= 3)
      read = `Black was down as much as ${agg.b.def} and is still ${diff} behind — material that left and never came back. That permanent cliff is the signature of a club blunder.`;
    else if (bigW && diff <= -3)
      read = `White was down as much as ${agg.w.def} and is still ${-diff} behind — a clean, lasting material loss.`;
    else if (bigW && diff >= -1)
      read = `White was down as much as ${agg.w.def} at one point, yet material is back to roughly level — that reads as a sacrifice with compensation, not a blunder. A pure en-prise count cannot tell those apart.`;
    else if (bigB && diff <= 1)
      read = `Black was down as much as ${agg.b.def} at one point, yet material is back to roughly level — sacrifice with compensation rather than a blunder.`;
    else if (agg.w.exp + agg.b.exp === 0)
      read = 'No material has been left en prise — both sides keep everything defended. Clean, controlled play on these metrics.';
    else
      read = `Material has been put en prise ${agg.w.exp + agg.b.exp} time(s), but nothing has stuck as a lasting deficit yet. A permanent jump in worst-deficit is the club-vs-master tell.`;
  }

  const Card = ({ label, w, b }: { label: string; w: string | number; b: string | number }) => (
    <div className="rounded-md border border-line bg-white px-2 py-1.5 text-center">
      <div className="text-[10px] uppercase tracking-wide text-ink2">{label}</div>
      <div className="text-sm">
        <span className="font-mono text-w">{w}</span>
        <span className="mx-1 text-ink2">·</span>
        <span className="font-mono text-b">{b}</span>
      </div>
    </div>
  );

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <Card label="Exposures" w={agg.w.exp} b={agg.b.exp} />
        <Card label="Avg space" w={avg(agg.w)} b={avg(agg.b)} />
        <Card label="Worst deficit" w={agg.w.def} b={agg.b.def} />
      </div>
      <p className="mt-2 text-xs leading-snug text-ink2">{read}</p>
    </div>
  );
}
