"""Engine-free positional feature engine — the canonical reference.

This module is the source of truth (CLAUDE.md §3, §6). The browser JS engine in
``web/`` must reproduce every value here exactly on the golden FENs.

Design (CLAUDE.md §13): object-oriented value objects + a stateless engine.

    Piece            immutable type/color with a piece value
    Board            grid[file][rank] board, built from FEN, owns attack generation
    SideFeatures     immutable per-side feature vector (CLAUDE.md §6 table)
    PositionFeatures immutable {w, b, tension} bundle
    FeatureEngine    computes SideFeatures/PositionFeatures from a Board

The documented functional contract (``features(grid)``, ``side_feats(grid, color)``)
is preserved as thin wrappers at the bottom of the module so the OO design and the
parity contract coexist.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, FrozenSet, Iterator, List, Optional, Tuple

# CLAUDE.md §6: piece values.
PIECE_VALUES: Dict[str, int] = {"p": 1, "n": 3, "b": 3, "r": 5, "q": 9, "k": 0}

# Offset tables shared by attack generation. Each is (delta_file, delta_rank).
_KNIGHT_OFFSETS: Tuple[Tuple[int, int], ...] = (
    (1, 2), (2, 1), (2, -1), (1, -2), (-1, -2), (-2, -1), (-2, 1), (-1, 2),
)
_KING_OFFSETS: Tuple[Tuple[int, int], ...] = (
    (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1),
)
_DIAGONAL: Tuple[Tuple[int, int], ...] = ((1, 1), (1, -1), (-1, 1), (-1, -1))
_ORTHOGONAL: Tuple[Tuple[int, int], ...] = ((1, 0), (-1, 0), (0, 1), (0, -1))

# Home squares of the developable minor pieces, per color, as (file, rank).
# Knights: b/g file; bishops: c/f file. Used by the ``dev`` feature.
_MINOR_HOME: Dict[str, FrozenSet[Tuple[int, int]]] = {
    "w": frozenset({(1, 0), (6, 0), (2, 0), (5, 0)}),
    "b": frozenset({(1, 7), (6, 7), (2, 7), (5, 7)}),
}
_KING_HOME: Dict[str, Tuple[int, int]] = {"w": (4, 0), "b": (4, 7)}

# The four center squares d4, e4, d5, e5 in (file, rank) form.
_CENTER_SQUARES: Tuple[Tuple[int, int], ...] = ((3, 3), (4, 3), (3, 4), (4, 4))

Color = str  # "w" | "b"
PieceType = str  # one of "pnbrqk"


def opposite(color: Color) -> Color:
    """Return the opposing color."""
    return "b" if color == "w" else "w"


@dataclass(frozen=True)
class Piece:
    """A single piece: its type (``pnbrqk``) and color (``w``/``b``)."""

    type: PieceType
    color: Color

    @property
    def value(self) -> int:
        """Material value of this piece (CLAUDE.md §6)."""
        return PIECE_VALUES[self.type]


class Board:
    """An 8x8 board indexed ``grid[file][rank]`` (file 0=a..7=h, rank 0=rank1..7=rank8).

    Built from a FEN string rather than any chess library's board export, so the
    representation is version-independent (CLAUDE.md §6, §7). The board owns the
    project's own attack generation; nothing here relies on chess.js / python-chess.
    """

    SIZE = 8

    def __init__(self, grid: List[List[Optional[Piece]]]) -> None:
        self._grid = grid

    # -- construction -------------------------------------------------------
    @classmethod
    def from_fen(cls, fen: str) -> "Board":
        """Build a board from the placement field of a FEN string."""
        grid: List[List[Optional[Piece]]] = [[None] * cls.SIZE for _ in range(cls.SIZE)]
        rows = fen.split(" ")[0].split("/")
        if len(rows) != cls.SIZE:
            raise ValueError(f"FEN must have {cls.SIZE} ranks, got {len(rows)}: {fen!r}")
        for i, row in enumerate(rows):
            rank = (cls.SIZE - 1) - i  # FEN lists rank 8 first; our rank 0 is rank 1.
            file = 0
            for ch in row:
                if ch.isdigit():
                    file += int(ch)
                elif ch.lower() in PIECE_VALUES:
                    color: Color = "b" if ch.islower() else "w"
                    if file >= cls.SIZE:
                        raise ValueError(f"FEN rank {row!r} overflows 8 files")
                    grid[file][rank] = Piece(ch.lower(), color)
                    file += 1
                else:
                    raise ValueError(f"FEN rank {row!r} has invalid symbol {ch!r}")
            if file != cls.SIZE:
                raise ValueError(f"FEN rank {row!r} does not fill 8 files")
        return cls(grid)

    # -- access -------------------------------------------------------------
    @staticmethod
    def in_bounds(file: int, rank: int) -> bool:
        """True if (file, rank) lies on the board."""
        return 0 <= file < Board.SIZE and 0 <= rank < Board.SIZE

    def piece_at(self, file: int, rank: int) -> Optional[Piece]:
        """Return the piece on (file, rank), or None if empty."""
        return self._grid[file][rank]

    def squares(self) -> Iterator[Tuple[int, int]]:
        """Iterate every (file, rank) square on the board."""
        for file in range(self.SIZE):
            for rank in range(self.SIZE):
                yield file, rank

    def pieces(self, color: Optional[Color] = None) -> Iterator[Tuple[int, int, Piece]]:
        """Iterate (file, rank, piece) for occupied squares, optionally filtered by color."""
        for file, rank in self.squares():
            piece = self._grid[file][rank]
            if piece is not None and (color is None or piece.color == color):
                yield file, rank, piece

    # -- attack generation (own logic, CLAUDE.md §6) ------------------------
    def attackers(self, target_file: int, target_rank: int, color: Color) -> List[PieceType]:
        """Piece types of ``color`` that attack the square (target_file, target_rank).

        Pawn diagonals (a ``color`` pawn one rank *behind* the target diagonally),
        knight/king offsets, and sliding bishop/queen (diagonals) and rook/queen
        (orthogonals) up to the first blocker. The list (not just a count) is
        returned because the hanging-piece test needs the cheapest attacker value.
        """
        out: List[PieceType] = []

        # Pawns: a color pawn sits one rank behind the target, on an adjacent file.
        pawn_rank = target_rank - 1 if color == "w" else target_rank + 1
        for ff in (target_file - 1, target_file + 1):
            if self.in_bounds(ff, pawn_rank):
                p = self._grid[ff][pawn_rank]
                if p is not None and p.color == color and p.type == "p":
                    out.append("p")

        for df, dr in _KNIGHT_OFFSETS:
            f, r = target_file + df, target_rank + dr
            if self.in_bounds(f, r):
                p = self._grid[f][r]
                if p is not None and p.color == color and p.type == "n":
                    out.append("n")

        for df, dr in _KING_OFFSETS:
            f, r = target_file + df, target_rank + dr
            if self.in_bounds(f, r):
                p = self._grid[f][r]
                if p is not None and p.color == color and p.type == "k":
                    out.append("k")

        for df, dr in _DIAGONAL:
            f, r = target_file + df, target_rank + dr
            while self.in_bounds(f, r):
                p = self._grid[f][r]
                if p is not None:
                    if p.color == color and p.type in ("b", "q"):
                        out.append(p.type)
                    break
                f, r = f + df, r + dr

        for df, dr in _ORTHOGONAL:
            f, r = target_file + df, target_rank + dr
            while self.in_bounds(f, r):
                p = self._grid[f][r]
                if p is not None:
                    if p.color == color and p.type in ("r", "q"):
                        out.append(p.type)
                    break
                f, r = f + df, r + dr

        return out

    def is_attacked_by(self, file: int, rank: int, color: Color) -> bool:
        """True if ``color`` attacks (file, rank) with at least one piece."""
        return bool(self.attackers(file, rank, color))

    def attacks_from(self, file: int, rank: int) -> List[Tuple[int, int]]:
        """Squares the piece on (file, rank) attacks. Pawns: diagonal capture squares
        only (per the catalog's mobility definition). Sliders: up to and including the
        first blocker. Empty square -> empty list. Used for per-piece mobility."""
        piece = self._grid[file][rank]
        if piece is None:
            return []
        out: List[Tuple[int, int]] = []
        t = piece.type
        if t == "p":
            dr = 1 if piece.color == "w" else -1
            for df in (-1, 1):
                f, r = file + df, rank + dr
                if self.in_bounds(f, r):
                    out.append((f, r))
        elif t == "n":
            for df, dr in _KNIGHT_OFFSETS:
                f, r = file + df, rank + dr
                if self.in_bounds(f, r):
                    out.append((f, r))
        elif t == "k":
            for df, dr in _KING_OFFSETS:
                f, r = file + df, rank + dr
                if self.in_bounds(f, r):
                    out.append((f, r))
        else:
            dirs: Tuple[Tuple[int, int], ...] = ()
            if t in ("b", "q"):
                dirs += _DIAGONAL
            if t in ("r", "q"):
                dirs += _ORTHOGONAL
            for df, dr in dirs:
                f, r = file + df, rank + dr
                while self.in_bounds(f, r):
                    out.append((f, r))
                    if self._grid[f][r] is not None:
                        break
                    f, r = f + df, r + dr
        return out


@dataclass(frozen=True)
class SideFeatures:
    """Immutable per-side feature vector (CLAUDE.md §6 table)."""

    control: int
    space: int
    center: int
    hang_ct: int
    hang_val: int
    kp: int
    shield: int
    mat: int
    dev: int
    castled: int
    center_occ: int  # own pieces/pawns occupying d4/e4/d5/e5
    islands: int  # connected pawn groups by file adjacency
    isolated: int  # pawns with no friendly pawn on adjacent files
    doubled: int  # extra pawns sharing a file (count - 1 per file)
    passed: int  # pawns with no enemy pawn ahead on same/adjacent files
    rook_open: int  # rooks on files with no own pawn (open or semi-open)
    mobility: int  # sum over pieces of attacked squares not occupied by own pieces
    outpost: int  # own knights on outpost squares (enemy half, pawn-defended, unassailable)
    bishop_quality: float  # sum over bishops of mobility / (1 + own pawns on its color complex)
    coordination: int  # own non-king pieces defended by >=1 own piece
    colour_complex: int  # controlled light squares minus controlled dark squares
    in_check: int  # 1 if the side's king is currently attacked, else 0


@dataclass(frozen=True)
class PositionFeatures:
    """Immutable bundle of both sides' features plus shared board tension."""

    w: SideFeatures
    b: SideFeatures
    tension: int


class FeatureEngine:
    """Computes :class:`SideFeatures` / :class:`PositionFeatures` from a :class:`Board`.

    Stateless: one engine can score any number of boards. All definitions follow
    CLAUDE.md §6 exactly and are mirrored by ``web/src/engine.js``.
    """

    def side_features(self, board: Board, color: Color) -> SideFeatures:
        """Compute the per-side feature vector for ``color`` on ``board``."""
        opp = opposite(color)
        control = self._control(board, color)
        space = self._space(board, color)
        center = self._center(board, color)
        mat, dev, king_sq, hang_ct, hang_val = self._material_dev_hang(board, color, opp)
        kp, shield, castled = self._king_features(board, color, opp, king_sq)
        center_occ = self._center_occ(board, color)
        islands, isolated, doubled, passed = self._pawn_structure(board, color, opp)
        rook_open = self._rook_open(board, color)
        mobility = self._mobility(board, color)
        outpost = self._outposts(board, color, opp)
        bishop_quality = self._bishop_quality(board, color)
        coordination = self._coordination(board, color)
        colour_complex = self._colour_complex(board, color)
        in_check = 1 if king_sq is not None and board.is_attacked_by(king_sq[0], king_sq[1], opp) else 0
        return SideFeatures(
            control=control,
            space=space,
            center=center,
            hang_ct=hang_ct,
            hang_val=hang_val,
            kp=kp,
            shield=shield,
            mat=mat,
            dev=dev,
            castled=castled,
            center_occ=center_occ,
            islands=islands,
            isolated=isolated,
            doubled=doubled,
            passed=passed,
            rook_open=rook_open,
            mobility=mobility,
            outpost=outpost,
            bishop_quality=bishop_quality,
            coordination=coordination,
            colour_complex=colour_complex,
            in_check=in_check,
        )

    def tension(self, board: Board) -> int:
        """# of occupied squares simultaneously attacked by the enemy and defended by the owner."""
        count = 0
        for file, rank, piece in board.pieces():
            opp = opposite(piece.color)
            if board.is_attacked_by(file, rank, opp) and board.is_attacked_by(file, rank, piece.color):
                count += 1
        return count

    def features(self, board: Board) -> PositionFeatures:
        """Compute both sides' features and the shared tension for ``board``."""
        return PositionFeatures(
            w=self.side_features(board, "w"),
            b=self.side_features(board, "b"),
            tension=self.tension(board),
        )

    # -- internals: one feature group per method ----------------------------
    def _control(self, board: Board, color: Color) -> int:
        """# of the 64 squares attacked by at least one of ``color``'s pieces."""
        return sum(1 for f, r in board.squares() if board.is_attacked_by(f, r, color))

    def _space(self, board: Board, color: Color) -> int:
        """Controlled squares in the opponent's half (White: rank>=4; Black: rank<=3)."""
        space = 0
        for f, r in board.squares():
            if not board.is_attacked_by(f, r, color):
                continue
            if (color == "w" and r >= 4) or (color == "b" and r <= 3):
                space += 1
        return space

    def _center(self, board: Board, color: Color) -> int:
        """Sum of ``color``'s attackers over {d4, e4, d5, e5}."""
        return sum(len(board.attackers(f, r, color)) for f, r in _CENTER_SQUARES)

    def _material_dev_hang(
        self, board: Board, color: Color, opp: Color
    ) -> Tuple[int, int, Optional[Tuple[int, int]], int, int]:
        """Single pass over ``color``'s pieces for material, development, king square, and hanging.

        Returns ``(mat, dev, king_square, hang_ct, hang_val)``.
        """
        mat = dev = hang_ct = hang_val = 0
        king_sq: Optional[Tuple[int, int]] = None
        home = _MINOR_HOME[color]
        for file, rank, piece in board.pieces(color):
            mat += piece.value
            if piece.type in ("n", "b") and (file, rank) not in home:
                dev += 1
            if piece.type == "k":
                king_sq = (file, rank)
                continue
            attackers = board.attackers(file, rank, opp)
            if attackers:
                defenders = board.attackers(file, rank, color)
                cheapest = min(PIECE_VALUES[t] for t in attackers)
                if not defenders or cheapest < piece.value:
                    hang_ct += 1
                    hang_val += piece.value
        return mat, dev, king_sq, hang_ct, hang_val

    def _king_features(
        self, board: Board, color: Color, opp: Color, king_sq: Optional[Tuple[int, int]]
    ) -> Tuple[int, int, int]:
        """King-zone pressure, pawn shield, and castled flag. Returns ``(kp, shield, castled)``."""
        if king_sq is None:
            return 0, 0, 0
        kf, kr = king_sq

        # King-zone pressure: enemy attacker counts over the king square + its 8 neighbors.
        kp = 0
        for df, dr in ((0, 0),) + _KING_OFFSETS:
            f, r = kf + df, kr + dr
            if board.in_bounds(f, r):
                kp += len(board.attackers(f, r, opp))

        # Pawn shield: own pawns on the <=3 files around the king, within 2 ranks in front.
        shield = 0
        front = (1, 2) if color == "w" else (-1, -2)
        for df in (-1, 0, 1):
            for dr in front:
                f, r = kf + df, kr + dr
                if board.in_bounds(f, r):
                    p = board.piece_at(f, r)
                    if p is not None and p.type == "p" and p.color == color:
                        shield += 1

        # Castled: king off its home square and on the g- or c-file.
        castled = 1 if king_sq != _KING_HOME[color] and kf in (6, 2) else 0
        return kp, shield, castled

    def _center_occ(self, board: Board, color: Color) -> int:
        """Own pieces/pawns physically occupying the four central squares."""
        occ = 0
        for f, r in _CENTER_SQUARES:
            p = board.piece_at(f, r)
            if p is not None and p.color == color:
                occ += 1
        return occ

    def _pawn_structure(self, board: Board, color: Color, opp: Color) -> Tuple[int, int, int, int]:
        """Return (islands, isolated, doubled, passed) for ``color``'s pawns."""
        own: List[Tuple[int, int]] = [(f, r) for f, r, p in board.pieces(color) if p.type == "p"]
        by_file: Dict[int, List[int]] = {}
        for f, r in own:
            by_file.setdefault(f, []).append(r)

        # Islands: runs of consecutive occupied files.
        islands = 0
        prev = -2
        for f in sorted(by_file):
            if f != prev + 1:
                islands += 1
            prev = f

        # Isolated: pawns with no friendly pawn on an adjacent file.
        files = set(by_file)
        isolated = sum(1 for f, _ in own if (f - 1) not in files and (f + 1) not in files)

        # Doubled: extra pawns sharing a file.
        doubled = sum(len(ranks) - 1 for ranks in by_file.values() if len(ranks) > 1)

        # Passed: no enemy pawn ahead on the same or adjacent file.
        enemy_by_file: Dict[int, List[int]] = {}
        for f, r, p in board.pieces(opp):
            if p.type == "p":
                enemy_by_file.setdefault(f, []).append(r)
        white = color == "w"
        passed = 0
        for f, r in own:
            blocked = any(
                (er > r if white else er < r)
                for nf in (f - 1, f, f + 1)
                for er in enemy_by_file.get(nf, [])
            )
            if not blocked:
                passed += 1
        return islands, isolated, doubled, passed

    def _rook_open(self, board: Board, color: Color) -> int:
        """Rooks on files with no own pawn (open or semi-open files)."""
        own_pawn_files = set()
        rook_files: List[int] = []
        for f, r, p in board.pieces(color):
            if p.type == "p":
                own_pawn_files.add(f)
            elif p.type == "r":
                rook_files.append(f)
        return sum(1 for f in rook_files if f not in own_pawn_files)

    def _mobility(self, board: Board, color: Color) -> int:
        """Sum over the side's pieces of attacked squares not occupied by an own piece
        (attack-set minus own-occupied, per the catalog)."""
        total = 0
        for f, r, _ in board.pieces(color):
            for tf, tr in board.attacks_from(f, r):
                target = board.piece_at(tf, tr)
                if target is None or target.color != color:
                    total += 1
        return total

    def _piece_mobility(self, board: Board, file: int, rank: int, color: Color) -> int:
        """Mobility of a single piece: its attacked squares not occupied by own pieces."""
        mob = 0
        for tf, tr in board.attacks_from(file, rank):
            target = board.piece_at(tf, tr)
            if target is None or target.color != color:
                mob += 1
        return mob

    def _outposts(self, board: Board, color: Color, opp: Color) -> int:
        """Own knights on outpost squares: in the enemy half, defended by an own pawn,
        and not attackable by any enemy pawn (no enemy pawn on an adjacent file ahead)."""
        enemy_pawns = [(f, r) for f, r, p in board.pieces(opp) if p.type == "p"]
        count = 0
        for f, r, p in board.pieces(color):
            if p.type != "n":
                continue
            in_enemy_half = r >= 4 if color == "w" else r <= 3
            if not in_enemy_half:
                continue
            if "p" not in board.attackers(f, r, color):  # must be pawn-defended
                continue
            assailable = any(
                ef in (f - 1, f + 1) and (er > r if color == "w" else er < r)
                for ef, er in enemy_pawns
            )
            if not assailable:
                count += 1
        return count

    def _bishop_quality(self, board: Board, color: Color) -> float:
        """Sum over own bishops of mobility / (1 + own pawns on the bishop's color complex).
        A bishop hemmed in by its own same-colored pawns scores low ("bad bishop")."""
        total = 0.0
        for f, r, p in board.pieces(color):
            if p.type != "b":
                continue
            complex_parity = (f + r) % 2
            own_pawns_on_complex = sum(
                1
                for pf, pr, pp in board.pieces(color)
                if pp.type == "p" and (pf + pr) % 2 == complex_parity
            )
            total += self._piece_mobility(board, f, r, color) / (1 + own_pawns_on_complex)
        return total

    def _coordination(self, board: Board, color: Color) -> int:
        """Own non-king pieces defended by at least one own piece — force harmony."""
        count = 0
        for f, r, p in board.pieces(color):
            if p.type == "k":
                continue
            if board.attackers(f, r, color):  # an own piece defends this square
                count += 1
        return count

    def _colour_complex(self, board: Board, color: Color) -> int:
        """Controlled light squares minus controlled dark squares. Positive = the side
        dominates the light complex; negative = the dark complex."""
        light = dark = 0
        for f, r in board.squares():
            if board.is_attacked_by(f, r, color):
                if (f + r) % 2 == 1:
                    light += 1
                else:
                    dark += 1
        return light - dark


# ---------------------------------------------------------------------------
# Functional contract (CLAUDE.md §6). Thin wrappers over the OO engine so the
# documented, tested API and the class design coexist.
# ---------------------------------------------------------------------------
_DEFAULT_ENGINE = FeatureEngine()


def side_feats(board: Board, color: Color) -> SideFeatures:
    """Functional alias for :meth:`FeatureEngine.side_features` (CLAUDE.md §6)."""
    return _DEFAULT_ENGINE.side_features(board, color)


def features(board: Board) -> PositionFeatures:
    """Functional alias for :meth:`FeatureEngine.features` (CLAUDE.md §6)."""
    return _DEFAULT_ENGINE.features(board)


def features_from_fen(fen: str) -> PositionFeatures:
    """Convenience: build a :class:`Board` from FEN and compute its features."""
    return _DEFAULT_ENGINE.features(Board.from_fen(fen))
