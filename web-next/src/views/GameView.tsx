import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameRecord, TournamentDoc } from '../types';
import { useJson } from '../hooks/useFetch';
import { useGameData } from '../hooks/useGameData';
import { Board } from '../components/game/Board';
import { MoveChip } from '../components/game/MoveChip';
import { FeatureTable } from '../components/game/FeatureTable';
import { ExplainPanel } from '../components/game/ExplainPanel';
import { TrendChart } from '../components/game/TrendChart';
import { Aggregates } from '../components/game/Aggregates';

const fmtName = (n: string, elo?: string | number) => (elo ? `${n} (${elo})` : n);

export function GameView({
  slug,
  initialGameId,
  initialPly = 0,
  onSelectGame,
}: {
  slug: string;
  initialGameId?: string;
  initialPly?: number;
  onSelectGame?: (id: string, ply: number) => void;
}) {
  const isCustom = slug === 'custom';
  const doc = useJson<TournamentDoc>(isCustom ? null : `./data/t/${slug}.json`);
  const games = useMemo(() => doc.data?.games ?? [], [doc.data]);

  const [gameId, setGameId] = useState<string | null>(initialGameId ?? null);
  const [customPgn, setCustomPgn] = useState('');
  const [submittedCustom, setSubmittedCustom] = useState('');
  const [backend, setBackend] = useState(true); // default on so MOVE/CLOCK features compute
  const [url, setUrl] = useState('http://localhost:8001');
  const [ply, setPly] = useState(initialPly);
  const [selectedId, setSelectedId] = useState('MAT.hanging');
  const appliedInitial = useRef(false);

  // Pick a default game when the tournament loads.
  useEffect(() => {
    if (!isCustom && games.length && !games.find((g) => g.id === gameId)) {
      setGameId(initialGameId && games.find((g) => g.id === initialGameId) ? initialGameId : games[0].id);
    }
  }, [games, isCustom, gameId, initialGameId]);

  const game: GameRecord | null = useMemo(() => games.find((g) => g.id === gameId) ?? null, [games, gameId]);
  const pgn = isCustom ? submittedCustom || null : game?.pgn ?? null;
  const names = game
    ? { w: fmtName(game.white, game.welo), b: fmtName(game.black, game.belo) }
    : { w: 'White', b: 'Black' };

  const { data, error, note, loading } = useGameData(pgn, backend, url);
  const nMoves = data?.moves.length ?? 0;

  // Reset to the start on a new game; honor a deep-link ply exactly once.
  useEffect(() => {
    if (!data) return;
    if (!appliedInitial.current && initialPly) {
      setPly(Math.min(initialPly, data.moves.length));
      appliedInitial.current = true;
    } else {
      setPly(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Keyboard navigation.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setPly((p) => Math.min(nMoves, p + 1));
      else if (e.key === 'ArrowLeft') setPly((p) => Math.max(0, p - 1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [nMoves]);

  // Reflect game+ply into the URL for shareable deep links.
  useEffect(() => {
    if (gameId && !isCustom) onSelectGame?.(gameId, ply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, ply]);

  const goto = (p: number) => setPly(Math.max(0, Math.min(nMoves, p)));
  const move = data && ply > 0 ? data.moves[ply - 1] : null;

  // group games by round for the picker
  const grouped = useMemo(() => {
    const out: { round: number; games: GameRecord[] }[] = [];
    for (const g of games) {
      const last = out[out.length - 1];
      if (!last || last.round !== g.round) out.push({ round: g.round, games: [g] });
      else last.games.push(g);
    }
    return out;
  }, [games]);

  const btn = 'rounded-md border border-line bg-white px-2.5 py-1 text-sm disabled:opacity-40';

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,460px)_1fr]">
      {/* left: board + chip + stepper + aggregates */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-b">{names.b}</span>
          {game && <span className="text-xs text-ink2">Round {game.round} · {game.result}</span>}
        </div>
        {data ? (
          <Board board={data.boards[ply]} move={move} selectedId={selectedId} />
        ) : (
          <div className="grid aspect-square w-full place-items-center rounded-md border border-line bg-white text-ink2">
            {loading ? 'Analyzing…' : error || 'Select a game'}
          </div>
        )}
        <div className="flex items-center justify-between text-sm">
          <span className="text-w">{names.w}</span>
        </div>

        <div className="min-h-[1.5rem]">{data && <MoveChip ply={ply} moves={data.moves} feats={data.feats} />}</div>

        <div className="flex items-center gap-1.5">
          <button className={btn} onClick={() => goto(0)} disabled={ply === 0}>⏮</button>
          <button className={btn} onClick={() => goto(ply - 1)} disabled={ply === 0}>‹</button>
          <button className={btn} onClick={() => goto(ply + 1)} disabled={ply === nMoves}>›</button>
          <button className={btn} onClick={() => goto(nMoves)} disabled={ply === nMoves}>⏭</button>
          <span className="ml-2 text-sm tabular-nums">
            <b>{ply}</b> / {nMoves} <span className="text-[11px] text-ink2">←/→</span>
          </span>
        </div>

        {data && <Aggregates feats={data.feats} upto={ply} />}
      </div>

      {/* right: controls + feature table + explain + trend */}
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {isCustom ? (
            <div className="flex w-full flex-col gap-2">
              <textarea
                className="h-24 w-full rounded-md border border-line bg-white p-2 font-mono text-xs"
                placeholder="Paste PGN…"
                value={customPgn}
                onChange={(e) => setCustomPgn(e.target.value)}
              />
              <button className={btn + ' self-start'} onClick={() => setSubmittedCustom(customPgn.trim())}>
                Load PGN
              </button>
            </div>
          ) : (
            <select
              className="min-w-[260px] rounded-md border border-line bg-white px-2 py-1 text-sm"
              value={gameId ?? ''}
              onChange={(e) => setGameId(e.target.value)}
            >
              {grouped.map((grp) => (
                <optgroup key={grp.round} label={`Round ${grp.round}`}>
                  {grp.games.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          <label className="flex items-center gap-1.5 text-xs text-ink2" title="Analyze via the Python backend (chesslab.api); falls back to offline if unreachable">
            <input type="checkbox" checked={backend} onChange={(e) => setBackend(e.target.checked)} /> Backend
          </label>
          <input
            className="w-44 rounded-md border border-line bg-white px-2 py-1 text-xs disabled:opacity-50"
            value={url}
            disabled={!backend}
            onChange={(e) => setUrl(e.target.value.trim())}
            spellCheck={false}
          />
        </div>
        {note && <p className="text-[11px] text-w">{note}</p>}
        {error && <p className="text-[11px] text-w">{error}</p>}

        {data && (
          <>
            <div className="h-[40vh] min-h-[280px]">
              <FeatureTable byId={data.plyIndex[ply]} meta={data.analysis.meta} selectedId={selectedId} onSelect={setSelectedId} />
            </div>
            <ExplainPanel byId={data.plyIndex[ply]} meta={data.analysis.meta} selectedId={selectedId} />
            <div className="rounded-md border border-line bg-white p-2">
              <div className="mb-1 text-xs text-ink2">
                Trend · {data.analysis.meta[selectedId]?.name ?? selectedId} <span className="float-right">ply {ply}</span>
              </div>
              <div className="relative h-[200px]">
                <TrendChart plyIndex={data.plyIndex} meta={data.analysis.meta} selectedId={selectedId} upto={ply} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
