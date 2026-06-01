import type { NormMove, SideFeats } from '../../engine/game';

const Tag = ({ kind, children }: { kind: string; children: React.ReactNode }) => {
  const tone: Record<string, string> = {
    cap: 'bg-paper2 text-ink2',
    chk: 'bg-w/15 text-w',
    cas: 'bg-b/15 text-b',
    exp: 'bg-w/20 text-w',
    dev: 'bg-good/15 text-good',
  };
  return <span className={`rounded px-1.5 py-0.5 text-[10px] ${tone[kind] ?? 'bg-paper2 text-ink2'}`}>{children}</span>;
};

/** Move banner: who moved, the SAN, and tags (capture / check / castle / en-prise / develops). */
export function MoveChip({ ply, moves, feats }: { ply: number; moves: NormMove[]; feats: SideFeats[] }) {
  if (ply === 0) return <span className="text-sm text-ink2">Starting position — step forward to begin.</span>;
  const m = moves[ply - 1];
  const mover = ply % 2 === 1 ? 'w' : 'b';
  const side = mover === 'w' ? 'White' : 'Black';
  const san = m.san;
  const tags: React.ReactNode[] = [];
  if (san.includes('x')) tags.push(<Tag key="cap" kind="cap">capture</Tag>);
  if (san.includes('#')) tags.push(<Tag key="mate" kind="chk">checkmate</Tag>);
  else if (san.includes('+')) tags.push(<Tag key="chk" kind="chk">check</Tag>);
  if (san.startsWith('O-O')) tags.push(<Tag key="cas" kind="cas">castles</Tag>);
  const before = feats[ply - 1][mover].hang_val;
  const after = feats[ply][mover].hang_val;
  if (after > before) tags.push(<Tag key="exp" kind="exp">left en prise +{after - before}</Tag>);
  if (ply <= 20 && feats[ply][mover].dev > feats[ply - 1][mover].dev) tags.push(<Tag key="dev" kind="dev">develops</Tag>);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`font-semibold ${mover === 'w' ? 'text-w' : 'text-b'}`}>
        {side}: {san}
      </span>
      {tags.length ? tags : <span className="text-sm text-ink2">quiet move</span>}
    </div>
  );
}
