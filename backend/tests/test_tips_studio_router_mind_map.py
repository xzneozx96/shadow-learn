from __future__ import annotations

import asyncio

import pytest

from app.job_store import get_job
from app.jobs.models import JobRow

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.usefixtures("db_session")]


async def _await_job(job_id: str, timeout: float = 2.0) -> JobRow:
    """Drive the loop until the background runner finishes."""
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        job = await get_job(job_id)
        if job is not None and job.status in {"complete", "error"}:
            return job
        await asyncio.sleep(0.01)
    raise AssertionError(f"job {job_id} did not finish in {timeout}s")


async def test_studio_mind_map_route_accepts_kind(client, monkeypatch):
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

    resp = await client.post(
        "/api/tips/studio/mind_map",
        json={"video_id": "abc123", "transcript": "hi", "locale": "en"},
    )
    # First POST may return 202 pending (background task in flight) or 200
    # ready if the runner finished synchronously under TestClient.
    assert resp.status_code in (200, 202)
    job_id = resp.json()["jobId"]
    job = await _await_job(job_id)
    assert job.status == "complete"
    data = job.result["data"]
    assert data["root"]["label"] == "root"
    assert data["root"]["children"][0]["label"] == "c1"


async def test_studio_mind_map_invalid_kind_rejected(client):
    resp = await client.post(
        "/api/tips/studio/zoobar",
        json={"video_id": "abc123", "transcript": "hi", "locale": "en"},
    )
    assert resp.status_code == 400


async def test_studio_mind_map_validates_depth(client, monkeypatch):
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
    resp = await client.post(
        "/api/tips/studio/mind_map",
        json={"video_id": "abc123", "transcript": "hi", "locale": "en"},
    )
    # Runner runs to error; depending on TestClient pump timing it may surface
    # as 202 pending (then the runner errors after the response) or 502 error.
    assert resp.status_code in (202, 502)
    job_id = resp.json()["jobId"]
    job = await _await_job(job_id)
    assert job.status == "error"
    assert "depth" in (job.error or "").lower()


async def test_studio_mind_map_full_validation_chain(client, monkeypatch):
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

    monkeypatch.setattr(
        "app.tips.services.studio.generate_studio_artifact", fake_generate,
    )
    resp = await client.post(
        "/api/tips/studio/mind_map",
        json={"video_id": "abc123", "transcript": "hi", "locale": "en"},
    )
    assert resp.status_code in (200, 202)
    job_id = resp.json()["jobId"]
    job = await _await_job(job_id)
    assert job.status == "complete"
    data = job.result["data"]
    assert len(data["root"]["children"]) == 59
