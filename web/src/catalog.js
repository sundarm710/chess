// Board-tier feature catalog for the offline quick mode.
//
// Mirrors the Python registry's 10 BOARD features (engine/chesslab/catalog/board.py
// → features.yaml). The backend's GET /features returns the same shape, so the UI
// renders identically whether values come from here (offline) or the API.
//
// `field` = the engine.js SideFeatures key (or 'tension' for the shared one).
// `side`  = 'per' (white & black) | 'shared'.
// `higher`= 'good' | 'bad' | 'neutral' — which direction is an advantage (table coloring).

export const BOARD_CATALOG = [
  {
    id: 'MAT.balance', field: 'mat', name: 'Material', tier: 'T0', category: 'MAT',
    side: 'per', higher: 'good', viz: 'trend', output_type: 'per-side', engine: 'none',
    description: 'Total material each side has on the board.',
    computation: 'Sum of piece values per side (P1 N3 B3 R5 Q9, K0).',
  },
  {
    id: 'MAT.hanging', field: 'hang_val', name: 'Hanging (en prise)', tier: 'T0', category: 'MAT',
    side: 'per', higher: 'bad', viz: 'board', output_type: 'per-side', engine: 'none',
    description: 'How much of your own material is sitting undefended under attack.',
    computation: 'Per non-king piece: attacked AND (undefended OR cheapest attacker value < piece value); sum the values.',
  },
  {
    id: 'ACT.control', field: 'control', name: 'Board control', tier: 'T1', category: 'ACT',
    side: 'per', higher: 'good', viz: 'trend', output_type: 'per-side', engine: 'none',
    description: 'How many squares your pieces attack — raw activity.',
    computation: 'Count of the 64 squares attacked by >=1 of the side’s pieces.',
  },
  {
    id: 'SPC.space', field: 'space', name: 'Space', tier: 'T2', category: 'SPC',
    side: 'per', higher: 'good', viz: 'trend', output_type: 'per-side', engine: 'none',
    description: 'Territory you control in the opponent’s half.',
    computation: 'Controlled squares in the opponent’s half (W: rank>=5, B: rank<=4).',
  },
  {
    id: 'SPC.center_control', field: 'center', name: 'Center control', tier: 'T1', category: 'SPC',
    side: 'per', higher: 'good', viz: 'board', output_type: 'per-side', engine: 'none',
    description: 'Pressure you exert on the four central squares.',
    computation: 'Sum of the side’s attackers over {d4, e4, d5, e5}.',
  },
  {
    id: 'DEV.count', field: 'dev', name: 'Developed minors', tier: 'T1', category: 'DEV',
    side: 'per', higher: 'good', viz: 'trend', output_type: 'per-side', engine: 'none',
    description: 'How many knights and bishops you’ve brought off their home squares.',
    computation: 'Knights+bishops NOT on their home squares (b1/g1/c1/f1; b8/g8/c8/f8).',
  },
  {
    id: 'KSF.in_check', field: 'in_check', name: 'In check', tier: 'T0', category: 'KSF',
    side: 'per', higher: 'bad', viz: 'board', output_type: 'per-side', engine: 'none',
    description: 'Whether your king is under attack right now.',
    computation: "1 if the side's king square is attacked by an enemy piece, else 0.",
  },
  {
    id: 'KSF.castle', field: 'castled', name: 'Castled', tier: 'T1', category: 'KSF',
    side: 'per', higher: 'good', viz: 'trend', output_type: 'per-side', engine: 'none',
    description: 'Whether the king has castled to safety.',
    computation: '1 if the king is off its home square and on the g- or c-file, else 0.',
  },
  {
    id: 'KSF.shield', field: 'shield', name: 'King pawn shield', tier: 'T2', category: 'KSF',
    side: 'per', higher: 'good', viz: 'board', output_type: 'per-side', engine: 'none',
    description: 'Pawns sheltering your king from the front.',
    computation: 'Own pawns on the <=3 files around the king, within 2 ranks in front.',
  },
  {
    id: 'KSF.zone_pressure', field: 'kp', name: 'King-zone pressure', tier: 'T2', category: 'KSF',
    side: 'per', higher: 'bad', viz: 'board', output_type: 'per-side', engine: 'none',
    description: 'How heavily the enemy attacks the squares around your king (lower is safer).',
    computation: 'Sum of enemy attacker counts over the king square + its 8 neighbors.',
  },
  {
    id: 'SPC.center_occ', field: 'center_occ', name: 'Center occupation', tier: 'T1', category: 'SPC',
    side: 'per', higher: 'good', viz: 'trend', output_type: 'per-side', engine: 'none',
    description: 'Pawns or pieces you physically park on the four central squares.',
    computation: 'Count of own pieces/pawns occupying {d4, e4, d5, e5}.',
  },
  {
    id: 'STR.islands', field: 'islands', name: 'Pawn islands', tier: 'T2', category: 'STR',
    side: 'per', higher: 'bad', viz: 'trend', output_type: 'per-side', engine: 'none',
    description: 'How fragmented your pawns are — fewer islands is healthier.',
    computation: 'Number of groups of pawns on consecutive files.',
  },
  {
    id: 'STR.isolated', field: 'isolated', name: 'Isolated pawns', tier: 'T2', category: 'STR',
    side: 'per', higher: 'bad', viz: 'trend', output_type: 'per-side', engine: 'none',
    description: 'Pawns with no friendly pawn beside them — chronic weaknesses.',
    computation: 'Pawns with no friendly pawn on either adjacent file.',
  },
  {
    id: 'STR.doubled', field: 'doubled', name: 'Doubled pawns', tier: 'T2', category: 'STR',
    side: 'per', higher: 'bad', viz: 'trend', output_type: 'per-side', engine: 'none',
    description: 'Extra pawns stacked on the same file — they can’t defend each other.',
    computation: 'Sum over files of (pawns_on_file - 1) for files with >1 pawn.',
  },
  {
    id: 'STR.passed', field: 'passed', name: 'Passed pawns', tier: 'T2', category: 'STR',
    side: 'per', higher: 'good', viz: 'trend', output_type: 'per-side', engine: 'none',
    description: 'Pawns with a clear run to promotion — a major endgame asset.',
    computation: 'Pawns with no enemy pawn ahead on the same or adjacent files.',
  },
  {
    id: 'ACT.rook_open', field: 'rook_open', name: 'Rooks on open files', tier: 'T2', category: 'ACT',
    side: 'per', higher: 'good', viz: 'trend', output_type: 'per-side', engine: 'none',
    description: 'Rooks standing on files unobstructed by your own pawns.',
    computation: 'Count of own rooks on files with no own pawn (open or semi-open).',
  },
  {
    id: 'ACT.mobility', field: 'mobility', name: 'Piece mobility', tier: 'T3', category: 'ACT',
    side: 'per', higher: 'good', viz: 'trend', output_type: 'per-side', engine: 'none',
    description: 'How many squares your pieces can act on — true activity, not piece count.',
    computation: 'Sum over own pieces of attacked squares not occupied by an own piece.',
  },
  {
    id: 'ACT.outpost', field: 'outpost', name: 'Knight outposts', tier: 'T3', category: 'ACT',
    side: 'per', higher: 'good', viz: 'board', output_type: 'per-side', engine: 'none',
    description: 'Knights parked on unassailable squares in enemy territory.',
    computation: "Own knights in the enemy half, pawn-defended, with no enemy pawn able to challenge them.",
  },
  {
    id: 'ACT.bishop_quality', field: 'bishop_quality', name: 'Bishop quality', tier: 'T3', category: 'ACT',
    side: 'per', higher: 'good', viz: 'trend', output_type: 'per-side', engine: 'none',
    description: "Good vs bad bishop — high when your bishops aren't hemmed in by your own pawns.",
    computation: "Sum over own bishops of mobility / (1 + own pawns on the bishop's color complex).",
  },
  {
    id: 'ACT.coordination', field: 'coordination', name: 'Coordination', tier: 'T3', category: 'ACT',
    side: 'per', higher: 'good', viz: 'trend', output_type: 'per-side', engine: 'none',
    description: 'How many of your pieces back each other up — force harmony.',
    computation: 'Count of own non-king pieces defended by at least one own piece.',
  },
  {
    id: 'STR.colour_complex', field: 'colour_complex', name: 'Colour-complex control', tier: 'T3', category: 'STR',
    side: 'per', higher: 'neutral', viz: 'trend', output_type: 'per-side', engine: 'none',
    description: 'Which square colour you dominate (+ light, − dark).',
    computation: 'Controlled light squares minus controlled dark squares.',
  },
  {
    id: 'STR.tension', field: 'tension', name: 'Tension', tier: 'T2', category: 'STR',
    side: 'shared', higher: 'neutral', viz: 'trend', output_type: 'scalar', engine: 'none',
    description: 'Unresolved contact — pieces/pawns at once attacked by the enemy and defended.',
    computation: 'Count of occupied squares simultaneously attacked by the enemy AND defended by the owner.',
  },
];

// id -> catalog entry, for quick lookup.
export const CATALOG_BY_ID = Object.fromEntries(BOARD_CATALOG.map((c) => [c.id, c]));

// id -> advantage direction ('good'|'bad'|'neutral'), for delta coloring in the UI.
export const HIGHER = Object.fromEntries(BOARD_CATALOG.map((c) => [c.id, c.higher]));

// The UI manifest shape (matches the backend's GET /features `features` map).
export function catalogManifest() {
  const meta = {};
  for (const c of BOARD_CATALOG) {
    meta[c.id] = {
      name: c.name, tier: c.tier, category: c.category, scope: 'position',
      description: c.description, computation: c.computation,
      output_type: c.output_type, viz: c.viz, engine: c.engine,
    };
  }
  return meta;
}

// Category display names for grouping in the UI.
export const CATEGORY_LABEL = {
  MAT: 'Material', KSF: 'King safety', DEV: 'Development',
  SPC: 'Space & center', STR: 'Structure', ACT: 'Activity',
  DYN: 'Dynamics', DEC: 'Decisions', TAC: 'Tactics', TIM: 'Time',
  END: 'Endgame', PREP: 'Preparation', EVAL: 'Evaluation',
};

// Intuitive display order: the fundamentals (material, king safety, space) on top;
// the finer judgment features (activity, bishops, outposts) lower. Ids not listed
// here fall to the bottom in manifest order. Includes backend-only MOVE/GAME ids.
export const ORDER = [
  'MAT.balance', 'MAT.hanging',
  'SPC.space', 'SPC.center_control', 'SPC.center_occ',
  'KSF.in_check', 'KSF.castle', 'KSF.shield', 'KSF.zone_pressure',
  'STR.islands', 'STR.isolated', 'STR.doubled', 'STR.passed', 'STR.colour_complex', 'STR.tension',
  'DEV.count',
  'ACT.control', 'ACT.mobility', 'ACT.coordination', 'ACT.rook_open', 'ACT.outpost', 'ACT.bishop_quality',
  'DYN.initiative', 'TAC.density', 'DEC.prophylaxis',
];
