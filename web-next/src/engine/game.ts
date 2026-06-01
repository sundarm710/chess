// Typed wrapper around the (reused, untyped) engine modules. Produces the same
// analysis payload in quick (offline) and backend modes, like web/src/app.js.
import { Chess } from 'chess.js';
import { Board, FeatureEngine } from './engine.js';
import { PgnParser } from './parser.js';
import { buildAnalysis, indexPly } from './analysis.js';
import { analyzeGame } from './api.js';

export interface Evidence {
  squares: string[];
  layman: string;
  technical: string;
}
export interface FeatureResult {
  id: string;
  side: string;
  value: number | null;
  delta: number | null;
  status: string;
  evidence: Evidence;
}
export interface Ply {
  ply: number;
  fen: string;
  san: string | null;
  uci: string | null;
  mover: string | null;
  phase?: string;
  features: FeatureResult[];
}
export interface ManifestEntry {
  name: string;
  tier?: string;
  category: string;
  description?: string;
  computation?: string;
  higher?: string;
}
export interface Analysis {
  meta: Record<string, ManifestEntry>;
  plies: Ply[];
}
export interface NormMove {
  san: string;
  mover: string;
  from: string | null;
  to: string | null;
  uci?: string;
}
// per ply: byId[id][side] = result
export type PlyIndex = Record<string, Record<string, FeatureResult>>;

export interface GameData {
  analysis: Analysis;
  boards: InstanceType<typeof Board>[];
  feats: SideFeats[];
  moves: NormMove[];
  plyIndex: PlyIndex[];
  source: 'quick' | 'backend';
}

export interface SideFeatures {
  [field: string]: number;
}
export interface SideFeats {
  w: SideFeatures;
  b: SideFeatures;
  tension: number;
}

const engine = new FeatureEngine();

function assemble(fens: string[], moves: NormMove[], analysis: Analysis, source: 'quick' | 'backend'): GameData {
  const boards = fens.map((f) => Board.fromFen(f));
  const feats = boards.map((b) => engine.features(b)) as SideFeats[];
  return { analysis, boards, feats, moves, plyIndex: analysis.plies.map(indexPly) as PlyIndex[], source };
}

export function analyzeQuick(pgn: string): GameData {
  const parser = new PgnParser(Chess);
  const { moves, fens } = parser.parse(pgn) as { moves: any[]; fens: string[] };
  const norm: NormMove[] = moves.map((m) => ({
    san: m.san,
    mover: m.color,
    from: m.from,
    to: m.to,
    uci: m.from + m.to + (m.promotion || ''),
  }));
  const boards = fens.map((f) => Board.fromFen(f));
  const feats = boards.map((b) => engine.features(b));
  const analysis = buildAnalysis({ fens, boards, feats, moves: norm }) as Analysis;
  return { analysis, boards, feats: feats as SideFeats[], moves: norm, plyIndex: analysis.plies.map(indexPly) as PlyIndex[], source: 'quick' };
}

export async function analyzeBackend(url: string, pgn: string): Promise<GameData> {
  const analysis = (await analyzeGame(url, pgn)) as Analysis;
  const fens = analysis.plies.map((p) => p.fen);
  const norm: NormMove[] = analysis.plies.slice(1).map((p) => ({
    san: p.san ?? '',
    mover: p.mover ?? '',
    from: p.uci ? p.uci.slice(0, 2) : null,
    to: p.uci ? p.uci.slice(2, 4) : null,
  }));
  return assemble(fens, norm, analysis, 'backend');
}
