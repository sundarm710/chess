"""API tests — the FE/BE contract for Milestone 1, with an injected temp store."""

import pytest
from fastapi.testclient import TestClient

from chesslab.api import create_app
from chesslab.store import FileFeatureStore

MORPHY = """[Event "Paris"]
1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7
8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8
13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0"""


@pytest.fixture()
def client(tmp_path):
    return TestClient(create_app(store=FileFeatureStore(tmp_path)))


class TestRoot:
    def test_root_lists_endpoints(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        body = resp.json()
        assert body["service"] == "Chess Style Lab"
        assert "GET /features" in body["endpoints"]


class TestFeaturesEndpoint:
    def test_returns_manifest(self, client):
        resp = client.get("/features")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["features"]) == 38
        assert "feature_set_version" in body
        assert body["features"]["MAT.balance"]["tier"] == "T0"


class TestGamesEndpoints:
    def test_ingest_then_fetch(self, client):
        post = client.post("/games", json={"pgn": MORPHY})
        assert post.status_code == 200
        gid = post.json()["game_id"]
        analysis = post.json()["analysis"]
        assert len(analysis["plies"]) == 34

        got = client.get(f"/games/{gid}/features")
        assert got.status_code == 200
        assert got.json()["game_id"] == gid
        assert got.json() == analysis  # served payload equals analysis

    def test_ingest_is_idempotent_id(self, client):
        a = client.post("/games", json={"pgn": MORPHY}).json()["game_id"]
        b = client.post("/games", json={"pgn": MORPHY}).json()["game_id"]
        assert a == b

    def test_unknown_game_404(self, client):
        assert client.get("/games/deadbeef0000/features").status_code == 404

    def test_bad_pgn_400(self, client):
        resp = client.post("/games", json={"pgn": "not a game"})
        assert resp.status_code == 400

    def test_board_values_match_golden_start(self, client):
        analysis = client.post("/games", json={"pgn": MORPHY}).json()["analysis"]
        p0 = analysis["plies"][0]
        mat_w = next(f for f in p0["features"] if f["id"] == "MAT.balance" and f["side"] == "w")
        assert mat_w["value"] == 39.0  # golden start-position material
