import { useEffect, useState } from 'react';
import { type GameData, analyzeBackend, analyzeQuick } from '../engine/game';

interface State {
  data: GameData | null;
  error: string;
  note: string; // non-fatal (e.g. backend fell back to offline)
  loading: boolean;
}

/** Analyze a PGN — backend mode with automatic fallback to the offline engine,
 *  mirroring web/src/app.js. Re-runs when the PGN or mode changes. */
export function useGameData(pgn: string | null, backend: boolean, url: string): State {
  const [state, setState] = useState<State>({ data: null, error: '', note: '', loading: !!pgn });

  useEffect(() => {
    if (!pgn) {
      setState({ data: null, error: '', note: '', loading: false });
      return;
    }
    let alive = true;
    setState({ data: null, error: '', note: '', loading: true });
    (async () => {
      if (backend) {
        try {
          const data = await analyzeBackend(url, pgn);
          if (alive) setState({ data, error: '', note: '', loading: false });
          return;
        } catch (e) {
          // fall through to offline, keeping a note
          try {
            const data = analyzeQuick(pgn);
            if (alive) setState({ data, error: '', note: `Backend unreachable — offline analysis. (${(e as Error).message})`, loading: false });
          } catch (e2) {
            if (alive) setState({ data: null, error: (e2 as Error).message, note: '', loading: false });
          }
          return;
        }
      }
      try {
        const data = analyzeQuick(pgn);
        if (alive) setState({ data, error: '', note: '', loading: false });
      } catch (e) {
        if (alive) setState({ data: null, error: (e as Error).message, note: '', loading: false });
      }
    })();
    return () => {
      alive = false;
    };
  }, [pgn, backend, url]);

  return state;
}
