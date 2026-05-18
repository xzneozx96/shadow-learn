from fastapi.testclient import TestClient

from app.main import app


def test_studio_mind_map_route_accepts_kind(monkeypatch):
    async def fake_generate(*, kind, transcript, locale):
        return {
            "root": {
                "label": "root",
                "summary": "x",
                "children": [{"label": "c1", "summary": "x", "children": []}],
            }
        }

    monkeypatch.setattr("app.tips.router._studio_svc.generate_studio_artifact", fake_generate)

    client = TestClient(app)
    resp = client.post(
        "/api/tips/studio/mind_map",
        json={"video_id": "abc123", "transcript": "hi", "locale": "en"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["root"]["label"] == "root"
    assert body["root"]["children"][0]["label"] == "c1"


def test_studio_mind_map_invalid_kind_rejected():
    client = TestClient(app)
    resp = client.post(
        "/api/tips/studio/zoobar",
        json={"video_id": "abc123", "transcript": "hi", "locale": "en"},
    )
    assert resp.status_code == 400


def test_studio_mind_map_validates_depth(monkeypatch):
    async def fake_generate(*, kind, transcript, locale):
        # 5-deep linear chain — exceeds depth 4
        def chain(n):
            if n == 0:
                return {"label": "leaf", "summary": "x", "children": []}
            return {"label": f"n{n}", "summary": "x", "children": [chain(n - 1)]}
        return {"root": chain(5)}

    monkeypatch.setattr("app.tips.router._studio_svc.generate_studio_artifact", fake_generate)
    client = TestClient(app)
    resp = client.post(
        "/api/tips/studio/mind_map",
        json={"video_id": "abc123", "transcript": "hi", "locale": "en"},
    )
    assert resp.status_code == 502
    assert "schema" in resp.json()["detail"].lower()


def test_studio_mind_map_full_validation_chain(monkeypatch):
    """Service returns a tree at the validator boundary — must pass validation."""
    async def fake_generate(*, kind, transcript, locale):
        # Exactly 60 nodes: 1 root + 59 children
        return {
            "root": {
                "label": "root",
                "summary": "x",
                "children": [
                    {"label": f"c{i}", "summary": "x", "children": []}
                    for i in range(59)
                ],
            }
        }

    monkeypatch.setattr("app.tips.router._studio_svc.generate_studio_artifact", fake_generate)
    client = TestClient(app)
    resp = client.post(
        "/api/tips/studio/mind_map",
        json={"video_id": "abc123", "transcript": "hi", "locale": "en"},
    )
    assert resp.status_code == 200
    assert len(resp.json()["root"]["children"]) == 59
