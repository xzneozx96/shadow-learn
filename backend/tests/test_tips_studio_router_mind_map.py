from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

from app.job_store import _keyed_jobs, jobs
from app.main import app


def _reset_jobs() -> None:
    jobs.clear()
    _keyed_jobs.clear()


def _await_job(job_id: str, timeout: float = 2.0) -> None:
    """Drive the asyncio loop until the runner finishes.

    TestClient pumps the loop during HTTP calls; once the response has
    returned, the spawned task may still be pending. Polling via short
    ``asyncio.sleep`` lets the event loop advance the task without coupling
    the test to a specific scheduler.
    """
    async def _wait() -> None:
        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            job = jobs.get(job_id)
            if job is not None and job.status in {"complete", "error"}:
                return
            await asyncio.sleep(0.01)
    asyncio.run(_wait())


def test_studio_mind_map_route_accepts_kind(monkeypatch):
    _reset_jobs()
    async def fake_generate(*, kind, transcript, locale):
        return {
            "root": {
                "label": "root",
                "summary": "x",
                "children": [{"label": "c1", "summary": "x", "children": []}],
            }
        }

    monkeypatch.setattr(
        "app.tips.services.studio.generate_studio_artifact", fake_generate,
    )

    client = TestClient(app)
    resp = client.post(
        "/api/tips/studio/mind_map",
        json={"video_id": "abc123", "transcript": "hi", "locale": "en"},
    )
    # First POST may return 202 pending (background task in flight) or 200
    # ready if the runner finished synchronously under TestClient.
    assert resp.status_code in (200, 202)
    job_id = resp.json()["jobId"]
    _await_job(job_id)
    assert jobs[job_id].status == "complete"
    data = jobs[job_id].result["data"]
    assert data["root"]["label"] == "root"
    assert data["root"]["children"][0]["label"] == "c1"


def test_studio_mind_map_invalid_kind_rejected():
    _reset_jobs()
    client = TestClient(app)
    resp = client.post(
        "/api/tips/studio/zoobar",
        json={"video_id": "abc123", "transcript": "hi", "locale": "en"},
    )
    assert resp.status_code == 400


def test_studio_mind_map_validates_depth(monkeypatch):
    _reset_jobs()
    async def fake_generate(*, kind, transcript, locale):
        # 5-deep linear chain — exceeds depth 4
        def chain(n):
            if n == 0:
                return {"label": "leaf", "summary": "x", "children": []}
            return {"label": f"n{n}", "summary": "x", "children": [chain(n - 1)]}
        return {"root": chain(5)}

    monkeypatch.setattr(
        "app.tips.services.studio.generate_studio_artifact", fake_generate,
    )
    client = TestClient(app)
    resp = client.post(
        "/api/tips/studio/mind_map",
        json={"video_id": "abc123", "transcript": "hi", "locale": "en"},
    )
    # Runner runs to error; depending on TestClient pump timing it may surface
    # as 202 pending (then the runner errors after the response) or 502 error.
    assert resp.status_code in (202, 502)
    job_id = resp.json()["jobId"]
    _await_job(job_id)
    assert jobs[job_id].status == "error"
    assert "depth" in (jobs[job_id].error or "").lower()


def test_studio_mind_map_full_validation_chain(monkeypatch):
    """Service returns a tree at the validator boundary — must pass validation."""
    _reset_jobs()
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

    monkeypatch.setattr(
        "app.tips.services.studio.generate_studio_artifact", fake_generate,
    )
    client = TestClient(app)
    resp = client.post(
        "/api/tips/studio/mind_map",
        json={"video_id": "abc123", "transcript": "hi", "locale": "en"},
    )
    assert resp.status_code in (200, 202)
    job_id = resp.json()["jobId"]
    _await_job(job_id)
    assert jobs[job_id].status == "complete"
    data = jobs[job_id].result["data"]
    assert len(data["root"]["children"]) == 59
