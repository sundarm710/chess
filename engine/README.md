# chesslab

Canonical, engine-free chess positional **feature engine** + analysis pipeline for
Chess Style Lab. The core engine (`chesslab.features`) is zero-dependency and is the
parity source of truth for the JS port; the `pipeline` extra adds PGN ingestion
(python-chess), the feature registry/orchestrator, storage (DuckDB+Parquet), and the
FastAPI service.

See the repo-root `README.md`, `CLAUDE.md`, and `FEATURE_CATALOG.md` for the full
project. Tests: `pytest` (or the repo-root `./run_tests.sh`).
