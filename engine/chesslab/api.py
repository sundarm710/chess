"""FastAPI service — the backend the analysis-mode frontend consumes.

Endpoints (Milestone 1):
  GET  /features                  -> registry manifest (drives the UI, data-driven)
  POST /games            {pgn}    -> ingest one game, analyze, persist, return analysis
  GET  /games/{id}/features       -> stored per-ply analysis (the stepper payload)

The app is built via :func:`create_app` so tests can inject a temp store. The core
engine stays zero-dependency; this module lives behind the ``pipeline`` extra.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .catalog import build_default_registry
from .manifest import build_manifest
from .orchestrator import Orchestrator
from .pipeline import parse_pgn
from .store import FeatureStore, FileFeatureStore

DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / ".data"


class IngestRequest(BaseModel):
    """Body for POST /games."""

    pgn: str


def create_app(store: Optional[FeatureStore] = None) -> FastAPI:
    """Build the FastAPI app. ``store`` defaults to a :class:`FileFeatureStore` under
    ``$CHESSLAB_DATA_DIR`` (or ``engine/.data``)."""
    registry = build_default_registry()
    orchestrator = Orchestrator(registry)
    if store is None:
        data_dir = os.environ.get("CHESSLAB_DATA_DIR", str(DEFAULT_DATA_DIR))
        store = FileFeatureStore(data_dir)

    app = FastAPI(title="Chess Style Lab", version="0.1.0")
    # The frontend is a static file (any port, or file://); allow it to call the API.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/")
    def root() -> Dict[str, Any]:
        """Service info + endpoint list, so the root isn't a bare 404."""
        return {
            "service": "Chess Style Lab",
            "version": "0.1.0",
            "feature_set_version": registry.feature_set_version(),
            "endpoints": {
                "GET /features": "feature manifest (the registry projection)",
                "POST /games": "ingest+analyze one game; body {pgn}",
                "GET /games/{id}/features": "per-ply analysis for an ingested game",
                "GET /docs": "interactive API docs",
            },
        }

    @app.get("/features")
    def get_features() -> Dict[str, Any]:
        """The feature manifest the UI renders from (registry projection)."""
        return {
            "feature_set_version": registry.feature_set_version(),
            "features": build_manifest(registry),
        }

    @app.post("/games")
    def post_game(req: IngestRequest) -> Dict[str, Any]:
        """Ingest + analyze one game; persist and return the analysis."""
        try:
            game = parse_pgn(req.pgn)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        analysis = orchestrator.run(game)
        store.write_game(game.game_id, analysis)
        return {"game_id": game.game_id, "analysis": analysis}

    @app.get("/games/{game_id}/features")
    def get_game_features(game_id: str) -> Dict[str, Any]:
        """Return a previously analyzed game's per-ply payload."""
        analysis = store.read_game(game_id)
        if analysis is None:
            raise HTTPException(status_code=404, detail=f"unknown game_id: {game_id}")
        return analysis

    return app


# Module-level app for `uvicorn chesslab.api:app`.
app = create_app()
