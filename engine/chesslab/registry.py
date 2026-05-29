"""Feature registry framework — the backbone for the full feature catalog.

This is the orchestration shell described in FEATURE_CATALOG.md and the project
plan. The canonical feature *math* still lives in :mod:`chesslab.features` (the
zero-dependency, parity-tested engine); this module provides the structure to
register every catalog feature, declare its dependencies and data requirements,
and compute it in a deterministic order.

Two orthogonal axes (NOT six parallel context types):

* **Scope** — nesting of what a feature sees: POSITION ⊂ MOVE ⊂ GAME ⊂ CORPUS.
* **Capability** — external data availability: CLOCK / EVAL / REF, attached to a
  context as optional providers. A feature declares ``requires``; the orchestrator
  marks it ``unavailable`` (never errors) when a provider is absent. Core features
  declare ``requires=frozenset()`` and never touch eval — this is the hard wall
  keeping cloud-eval out of the core path (CLAUDE.md §2).

The registry is the single source of truth; ``features.yaml`` is generated from it
(see the exporter) so the pipeline and UI consume one definition.
"""

from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, FrozenSet, Generic, List, Optional, Sequence, Tuple, TypeVar

from .features import Board, Color, FeatureEngine, PositionFeatures


class Scope(Enum):
    """The nesting level a feature is computed at. Order matters: lower scopes are
    computed first so higher scopes can depend on their results."""

    POSITION = "position"
    MOVE = "move"
    GAME = "game"
    CORPUS = "corpus"


# Compute order; also used to reject illegal upward dependencies.
SCOPE_ORDER: Tuple[Scope, ...] = (Scope.POSITION, Scope.MOVE, Scope.GAME, Scope.CORPUS)


def scope_rank(scope: Scope) -> int:
    """Position of ``scope`` in the compute order (POSITION=0 … CORPUS=3)."""
    return SCOPE_ORDER.index(scope)


class Capability(Enum):
    """External-data capability a feature may require. Absent ⇒ feature is skipped
    with status ``unavailable`` rather than failing."""

    CLOCK = "clock"  # per-move time from PGN %clk
    EVAL = "eval"  # Lichess cached cloud-eval (optional tier, never local engine)
    REF = "ref"  # reference DB: opening explorer / masters


class ResultStatus(str, Enum):
    """Outcome of computing one feature at one location."""

    OK = "ok"
    UNAVAILABLE = "unavailable"  # a required capability/provider was missing
    NA = "na"  # not applicable to this position (e.g. no bishop to grade)


@dataclass(frozen=True)
class Evidence:
    """Why a feature has its value — the raw material for per-move explanations.

    ``squares``/``pieces`` drive board highlighting; the two notes are short
    human-readable strings (layman + technical) generated alongside the value.
    """

    squares: Tuple[str, ...] = ()
    pieces: Tuple[str, ...] = ()
    note_layman: str = ""
    note_tech: str = ""


@dataclass(frozen=True)
class FeatureResult:
    """One feature's value at one location (a side, at a ply/game/corpus).

    ``delta`` is filled by the orchestrator (vs the same feature at the prior ply),
    so the math for "how it changed" lives in one place, not in the UI.
    """

    feature_id: str
    side: str  # "w" | "b" | "shared"
    value: Optional[float]
    evidence: Tuple[Evidence, ...] = ()
    unit: Optional[str] = None
    status: ResultStatus = ResultStatus.OK
    delta: Optional[float] = None

    def with_delta(self, delta: Optional[float]) -> "FeatureResult":
        """Return a copy with ``delta`` set (frozen dataclasses are immutable)."""
        return FeatureResult(
            feature_id=self.feature_id,
            side=self.side,
            value=self.value,
            evidence=self.evidence,
            unit=self.unit,
            status=self.status,
            delta=delta,
        )


@dataclass(frozen=True)
class FeatureMeta:
    """The metadata record for a feature (FEATURE_CATALOG.md §3).

    Required fields mirror the starred catalog fields; the rest carry the full
    registry/DB record. This object is what ``features.yaml`` and the UI manifest
    are generated from.
    """

    id: str
    name: str
    tier: str  # T0–T6
    scope: Scope
    category: str  # MAT, KSF, DEV, SPC, STR, ACT, DYN, DEC, TIM, END, PREP, EVAL
    description: str  # one-line layman
    computation: str  # technical algorithm
    inputs: str  # catalog inputs string, e.g. "P", "M/G", "C/E"
    requires: FrozenSet[Capability] = frozenset()
    output_type: str = "scalar"  # scalar | per-side | rate | distribution | vector
    aggregation: str = ""
    normalization: str = ""
    saturation: str = ""
    confounders: str = ""
    depends_on: Tuple[str, ...] = ()
    residualize_on: str = ""
    status: str = "implemented"  # research | planned | implemented
    viz: str = ""  # heatmap | trend | scatter | radar | board
    higher: str = "neutral"  # good | bad | neutral — which direction is an advantage
    version: int = 1

    @property
    def engine(self) -> str:
        """Engine-dependency policy string for the catalog/manifest."""
        return "cached-eval-optional" if Capability.EVAL in self.requires else "none"


# ---------------------------------------------------------------------------
# Contexts — one per scope, each nesting the lower level. Capability providers
# (eval/clock/ref) hang off the context and are None when unavailable.
# ---------------------------------------------------------------------------
@dataclass
class _Providers:
    """Optional external-data providers attached to any context."""

    clock: Optional[object] = None
    eval: Optional[object] = None
    ref: Optional[object] = None

    def has(self, capability: Capability) -> bool:
        return getattr(self, capability.value) is not None


class PositionContext:
    """A single position. Lazily computes the board-engine feature bundle once and
    caches it, so many POSITION features share one computation."""

    def __init__(
        self,
        board: Board,
        ply: int = 0,
        fen: Optional[str] = None,
        side_to_move: Color = "w",
        providers: Optional[_Providers] = None,
        results: Optional[Dict[str, List[FeatureResult]]] = None,
        engine: Optional[FeatureEngine] = None,
    ) -> None:
        self.board = board
        self.ply = ply
        self.fen = fen
        self.side_to_move = side_to_move
        self.providers = providers or _Providers()
        self.results: Dict[str, List[FeatureResult]] = results if results is not None else {}
        self._engine = engine or FeatureEngine()
        self._cached: Optional[PositionFeatures] = None

    @property
    def position_features(self) -> PositionFeatures:
        """The board engine's full feature bundle for this position (cached)."""
        if self._cached is None:
            self._cached = self._engine.features(self.board)
        return self._cached


class MoveContext:
    """A transition: the positions before and after a single ply, plus move facts."""

    def __init__(
        self,
        before: PositionContext,
        after: PositionContext,
        san: str,
        mover: Color,
        legal_moves: Optional[Sequence[str]] = None,
        providers: Optional[_Providers] = None,
        results: Optional[Dict[str, List[FeatureResult]]] = None,
    ) -> None:
        self.before = before
        self.after = after
        self.san = san
        self.mover = mover
        self.legal_moves = list(legal_moves or [])
        self.providers = providers or _Providers()
        self.results = results if results is not None else {}


class GameContext:
    """A whole game: its positions and moves, plus already-computed lower-scope
    results for GAME features to aggregate over."""

    def __init__(
        self,
        positions: Sequence[PositionContext],
        moves: Sequence[MoveContext],
        meta: Optional[Dict[str, object]] = None,
        providers: Optional[_Providers] = None,
        results: Optional[Dict[str, List[FeatureResult]]] = None,
    ) -> None:
        self.positions = list(positions)
        self.moves = list(moves)
        self.meta = meta or {}
        self.providers = providers or _Providers()
        self.results = results if results is not None else {}


class CorpusContext:
    """Many games for CORPUS features (player/tournament rollups). Future scope."""

    def __init__(
        self,
        games: Sequence[GameContext],
        meta: Optional[Dict[str, object]] = None,
        providers: Optional[_Providers] = None,
    ) -> None:
        self.games = list(games)
        self.meta = meta or {}
        self.providers = providers or _Providers()


# ---------------------------------------------------------------------------
# Feature ABC + scope-bound subclasses
# ---------------------------------------------------------------------------
#: Context type a feature consumes; bound per scope so overrides stay type-safe.
CtxT = TypeVar("CtxT")


class Feature(ABC, Generic[CtxT]):
    """A registered feature: metadata plus a ``compute`` that returns one result per
    relevant side. Generic over its context type so scope subclasses can narrow
    ``compute`` without violating Liskov substitution."""

    #: Each concrete feature sets this (frozen FeatureMeta).
    meta: FeatureMeta

    @property
    def id(self) -> str:
        return self.meta.id

    @property
    def scope(self) -> Scope:
        return self.meta.scope

    @property
    def requires(self) -> FrozenSet[Capability]:
        return self.meta.requires

    @abstractmethod
    def compute(self, ctx: CtxT) -> List[FeatureResult]:
        """Compute this feature for the given context, returning per-side results."""
        raise NotImplementedError


class PositionFeature(Feature[PositionContext]):
    """Scope = POSITION; ``compute`` receives a :class:`PositionContext`."""

    @abstractmethod
    def compute(self, ctx: PositionContext) -> List[FeatureResult]:
        raise NotImplementedError


class MoveFeature(Feature[MoveContext]):
    """Scope = MOVE; ``compute`` receives a :class:`MoveContext`."""

    @abstractmethod
    def compute(self, ctx: MoveContext) -> List[FeatureResult]:
        raise NotImplementedError


class GameFeature(Feature[GameContext]):
    """Scope = GAME; ``compute`` receives a :class:`GameContext`."""

    @abstractmethod
    def compute(self, ctx: GameContext) -> List[FeatureResult]:
        raise NotImplementedError


class CorpusFeature(Feature[CorpusContext]):
    """Scope = CORPUS; ``compute`` receives a :class:`CorpusContext`."""

    @abstractmethod
    def compute(self, ctx: CorpusContext) -> List[FeatureResult]:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------
class RegistryError(Exception):
    """Raised when the registry is structurally invalid (bad meta, cycle, etc.)."""


class FeatureRegistry:
    """Holds features keyed by id; validates structure and provides compute order."""

    def __init__(self) -> None:
        self._features: Dict[str, "Feature[Any]"] = {}

    def register(self, feature: "Feature[Any]") -> "Feature[Any]":
        """Register a feature; raises on duplicate id."""
        fid = feature.meta.id
        if fid in self._features:
            raise RegistryError(f"duplicate feature id: {fid!r}")
        self._features[fid] = feature
        return feature

    def get(self, feature_id: str) -> "Feature[Any]":
        return self._features[feature_id]

    def all(self) -> "List[Feature[Any]]":
        """All features, sorted by id for deterministic output."""
        return [self._features[k] for k in sorted(self._features)]

    def by_scope(self, scope: Scope) -> "List[Feature[Any]]":
        """Features at a given scope, in dependency (topological) order."""
        members = [f for f in self.all() if f.scope is scope]
        return self._toposort(members)

    def __len__(self) -> int:
        return len(self._features)

    def __contains__(self, feature_id: object) -> bool:
        return feature_id in self._features

    # -- validation ---------------------------------------------------------
    def validate(self) -> None:
        """Assert the registry is well-formed: complete meta, resolvable and
        acyclic ``depends_on``, and no illegal upward-scope dependencies."""
        for feat in self.all():
            self._validate_meta(feat.meta)
        self._validate_dependencies()

    @staticmethod
    def _validate_meta(meta: FeatureMeta) -> None:
        required = {
            "id": meta.id,
            "name": meta.name,
            "tier": meta.tier,
            "category": meta.category,
            "description": meta.description,
            "computation": meta.computation,
            "inputs": meta.inputs,
        }
        missing = [k for k, v in required.items() if not v]
        if missing:
            raise RegistryError(f"feature {meta.id!r} missing required meta: {missing}")
        if not isinstance(meta.scope, Scope):
            raise RegistryError(f"feature {meta.id!r} has invalid scope {meta.scope!r}")

    def _validate_dependencies(self) -> None:
        for feat in self.all():
            for dep in feat.meta.depends_on:
                if dep not in self._features:
                    raise RegistryError(f"{feat.id!r} depends on unknown feature {dep!r}")
                dep_scope = self._features[dep].scope
                if scope_rank(dep_scope) > scope_rank(feat.scope):
                    raise RegistryError(
                        f"{feat.id!r} ({feat.scope.value}) depends on higher-scope "
                        f"{dep!r} ({dep_scope.value}) — upward deps are illegal"
                    )
        # Cycle detection across the whole graph.
        self._toposort(self.all())

    @staticmethod
    def _toposort(features: "List[Feature[Any]]") -> "List[Feature[Any]]":
        """Kahn's algorithm over the subgraph induced by ``features``; raises on a
        cycle. Edges only count when both endpoints are in ``features``."""
        ids = {f.id for f in features}
        by_id = {f.id: f for f in features}
        indeg: Dict[str, int] = {f.id: 0 for f in features}
        adj: Dict[str, List[str]] = {f.id: [] for f in features}
        for feat in features:
            for dep in feat.meta.depends_on:
                if dep in ids:
                    adj[dep].append(feat.id)
                    indeg[feat.id] += 1
        queue = sorted([fid for fid, d in indeg.items() if d == 0])
        order: "List[Feature[Any]]" = []
        while queue:
            fid = queue.pop(0)
            order.append(by_id[fid])
            for nxt in sorted(adj[fid]):
                indeg[nxt] -= 1
                if indeg[nxt] == 0:
                    queue.append(nxt)
            queue.sort()
        if len(order) != len(features):
            cyclic = sorted(ids - {f.id for f in order})
            raise RegistryError(f"dependency cycle among features: {cyclic}")
        return order

    # -- versioning ---------------------------------------------------------
    def feature_set_version(self) -> str:
        """Stable short hash of the registry's definitions. Changing any feature's
        meta (incl. version) changes this, invalidating stored results."""
        h = hashlib.sha256()
        for feat in self.all():
            m = feat.meta
            h.update(
                f"{m.id}|{m.version}|{m.scope.value}|{m.category}|{m.tier}|"
                f"{sorted(c.value for c in m.requires)}|{m.depends_on}".encode()
            )
        return h.hexdigest()[:12]
