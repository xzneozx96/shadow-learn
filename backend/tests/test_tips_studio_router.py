from __future__ import annotations

from fastapi.testclient import TestClient

from app.job_store import Job, _keyed_jobs, jobs
from app.main import app

client = TestClient(app)


def _reset_jobs() -> None:
    jobs.clear()
    _keyed_jobs.clear()


def _fake_kick_off(job_state: Job, job_id: str = "test-job"):
    """Return a stub matching ``kick_off_studio_job``'s call shape.

    The stub places *job_state* into ``jobs`` under *job_id* and registers
    the keyed-job index, so the router's response synthesis + the status
    probe both see the same job. No asyncio task is spawned.
    """
    def _stub(*, kind, video_id, transcript, locale):
        jobs[job_id] = job_state
        _keyed_jobs[f"tip-studio:{kind}:{video_id}:{locale}"] = job_id
        return job_id
    return _stub


def test_post_studio_summary_complete_returns_200_ready(monkeypatch):
    _reset_jobs()
    fake_data = {"abstract": "It is about tones.", "takeaways": ["a", "b", "c"]}
    monkeypatch.setattr(
        "app.tips.router._studio_svc.kick_off_studio_job",
        _fake_kick_off(Job(status="complete", step="complete", result={"data": fake_data}, error=None)),
    )

    resp = client.post(
        "/api/tips/studio/summary",
        json={"video_id": "abc123", "transcript": "hello world", "locale": "en"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert body["jobId"] == "test-job"
    assert body["data"] == fake_data


def test_post_studio_processing_returns_202_pending(monkeypatch):
    _reset_jobs()
    monkeypatch.setattr(
        "app.tips.router._studio_svc.kick_off_studio_job",
        _fake_kick_off(Job(status="processing", step="queued", result=None, error=None)),
    )

    resp = client.post(
        "/api/tips/studio/summary",
        json={"video_id": "abc123", "transcript": "hi", "locale": "en"},
    )
    assert resp.status_code == 202
    body = resp.json()
    assert body["status"] == "pending"
    assert body["jobId"] == "test-job"


def test_post_studio_invalid_kind_returns_400():
    _reset_jobs()
    resp = client.post(
        "/api/tips/studio/notreal",
        json={"video_id": "abc123", "transcript": "x", "locale": "en"},
    )
    assert resp.status_code == 400


def test_post_studio_empty_transcript_returns_422():
    _reset_jobs()
    resp = client.post(
        "/api/tips/studio/summary",
        json={"video_id": "abc123", "transcript": "", "locale": "en"},
    )
    assert resp.status_code in (400, 422)


def test_post_studio_invalid_locale_returns_422():
    _reset_jobs()
    resp = client.post(
        "/api/tips/studio/summary",
        json={"video_id": "abc123", "transcript": "x", "locale": "fr"},
    )
    assert resp.status_code in (400, 422)


def test_post_studio_upstream_error_returns_502(monkeypatch):
    _reset_jobs()
    monkeypatch.setattr(
        "app.tips.router._studio_svc.kick_off_studio_job",
        _fake_kick_off(Job(status="error", step="error", result=None, error="openrouter down")),
    )

    resp = client.post(
        "/api/tips/studio/summary",
        json={"video_id": "abc123", "transcript": "hi", "locale": "en"},
    )
    assert resp.status_code == 502
    body = resp.json()
    assert body["status"] == "error"
    assert "openrouter" in body["error"]


def test_post_studio_cards_returns_valid_cards(monkeypatch):
    _reset_jobs()
    fake_data = {
        "cards": [
            {"id": "le-guo", "front": "了 vs 过?", "rule": "Completed action vs experience.",
             "example": "我吃了 vs 我吃过", "trap": "Not interchangeable."},
        ]
    }
    monkeypatch.setattr(
        "app.tips.router._studio_svc.kick_off_studio_job",
        _fake_kick_off(Job(status="complete", step="complete", result={"data": fake_data}, error=None)),
    )

    resp = client.post(
        "/api/tips/studio/cards",
        json={"video_id": "abc123", "transcript": "lesson on le and guo", "locale": "en"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert len(body["data"]["cards"]) == 1
    assert body["data"]["cards"][0]["id"] == "le-guo"


# ---- Status probe (GET) tests -----------------------------------------------


def test_get_studio_status_no_job_returns_404():
    _reset_jobs()
    resp = client.get("/api/tips/studio/summary/abc123", params={"locale": "en"})
    assert resp.status_code == 404
    assert resp.json()["status"] == "none"


def test_get_studio_status_pending_after_post(monkeypatch):
    _reset_jobs()
    monkeypatch.setattr(
        "app.tips.router._studio_svc.kick_off_studio_job",
        _fake_kick_off(Job(status="processing", step="queued", result=None, error=None)),
    )

    post_resp = client.post(
        "/api/tips/studio/summary",
        json={"video_id": "abc123", "transcript": "hi", "locale": "en"},
    )
    assert post_resp.status_code == 202

    # Now resume via the probe — the same (kind, video_id, locale) tuple
    # surfaces the live job without spending a second OpenRouter call.
    probe = client.get("/api/tips/studio/summary/abc123", params={"locale": "en"})
    assert probe.status_code == 202
    body = probe.json()
    assert body["status"] == "pending"
    assert body["jobId"] == "test-job"


def test_get_studio_status_ready_after_completion(monkeypatch):
    _reset_jobs()
    fake_data = {"abstract": "x" * 20, "takeaways": ["a", "b", "c"]}
    monkeypatch.setattr(
        "app.tips.router._studio_svc.kick_off_studio_job",
        _fake_kick_off(Job(status="complete", step="complete", result={"data": fake_data}, error=None)),
    )
    client.post(
        "/api/tips/studio/summary",
        json={"video_id": "abc123", "transcript": "hi", "locale": "en"},
    )

    probe = client.get("/api/tips/studio/summary/abc123", params={"locale": "en"})
    assert probe.status_code == 200
    body = probe.json()
    assert body["status"] == "ready"
    assert body["data"] == fake_data


def test_get_studio_status_invalid_kind_returns_400():
    _reset_jobs()
    resp = client.get("/api/tips/studio/notreal/abc123", params={"locale": "en"})
    assert resp.status_code == 400


def test_get_studio_status_invalid_locale_returns_400():
    _reset_jobs()
    resp = client.get("/api/tips/studio/summary/abc123", params={"locale": "fr"})
    assert resp.status_code == 400


def test_get_studio_status_invalid_video_id_returns_400():
    _reset_jobs()
    resp = client.get("/api/tips/studio/summary/!!!", params={"locale": "en"})
    assert resp.status_code == 400
