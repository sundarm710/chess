// Typed mirror of the profile JSON contract (engine/chesslab/aggregate.py).
// Strict types replace the vanilla app's defensive `(p.meta[id] || {})` access.

export type Higher = 'good' | 'bad' | 'neutral';
export type Phase = 'opening' | 'middlegame' | 'endgame';
export type Color = 'all' | 'w' | 'b';

export interface FeatureMeta {
  name: string;
  category: string;
  higher: Higher;
  requires: string[];
  description: string;
}

export interface Slice {
  mean: number;
  n: number;
  approx?: boolean;
}

export interface Rollup {
  n: number;
  mean: number | null;
  stdev: number | null;
  ci: number | null;
  mean_white: number | null;
  n_white: number;
  mean_black: number | null;
  n_black: number;
  n_unavailable: number;
  phases?: Partial<Record<Phase, Slice>>;
  cross?: Record<string, Slice>; // "opening:w" … "endgame:b"
}

export interface GameRow {
  id: string;
  round: number;
  color: 'w' | 'b';
  opp: string;
  result: string;
  score: number;
  vals: Record<string, number>;
  // per-phase per-feature values (only on cross-eligible / small dense fields)
  phase_vals?: Partial<Record<Phase, Record<string, number>>>;
}

export interface PlayerDoc {
  games: number;
  score: number;
  wins: number;
  draws: number;
  losses: number;
  performance_elo: number | null;
  avg_opp_elo: number | null;
  rollups: Record<string, Rollup>;
  game_rows: GameRow[];
}

export interface Leaderboard {
  higher: Higher;
  available: boolean;
  entries: [string, number, number][];
}

export interface ResultCorrelation {
  r: number;
  n: number;
  phases?: Partial<Record<Phase, { r: number; n: number }>>;
}

export interface Profile {
  slug: string;
  label: string;
  has_clock: boolean;
  has_eval: boolean;
  n_min: number;
  emit_cross: boolean;
  meta: Record<string, FeatureMeta>;
  players: Record<string, PlayerDoc>;
  leaderboards: Record<string, Leaderboard>;
  result_correlation: Record<string, ResultCorrelation>;
}

export interface LibraryEntry {
  slug: string;
  tournament: string;
  year: number;
  section: string;
  label: string;
}

export interface GameRecord {
  id: string;
  round: number;
  board?: number;
  white: string;
  black: string;
  welo?: string | number;
  belo?: string | number;
  result: string;
  eco?: string;
  opening?: string;
  label: string;
  pgn: string;
}

export interface TournamentDoc {
  games: GameRecord[];
}
