from __future__ import annotations

import pytest

from app.catalog import service as catalog
from app.job_store import register_job, register_keyed_job, update_job

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.usefixtures("db_session")]


def _fake_kick_off(**job_state):
    async def _stub(*, kind, video_id, transcript, locale):
        job_id = await register_job(id_prefix="tip-studio", user_id=None)
        await update_job(job_id, **job_state)
        await register_keyed_job(f"tip-studio:{kind}:{video_id}:{locale}", job_id)
        return job_id
    return _stub


async def test_post_studio_summary_complete_returns_200_ready(client, monkeypatch):
    fake_data = {"abstract": "It is about tones.", "takeaways": ["a", "b", "c"]}
    monkeypatch.setattr(
        "app.tips.router._studio_svc.kick_off_studio_job",
        _fake_kick_off(status="complete", step="complete", result={"data": fake_data}),
    )

    resp = await client.post(
        "/api/tips/studio/summary",
        json={"video_id": "abc123", "transcript": "hello world", "locale": "en"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert body["jobId"].startswith("tip-studio-")
    assert body["data"] == fake_data


async def test_post_studio_processing_returns_202_pending(client, monkeypatch):
    monkeypatch.setattr(
        "app.tips.router._studio_svc.kick_off_studio_job",
        _fake_kick_off(),
    )

    resp = await client.post(
        "/api/tips/studio/summary",
        json={"video_id": "abc123", "transcript": "hi", "locale": "en"},
    )
    assert resp.status_code == 202
    body = resp.json()
    assert body["status"] == "pending"
    assert body["jobId"].startswith("tip-studio-")


async def test_post_studio_invalid_kind_returns_400(client):
    resp = await client.post(
        "/api/tips/studio/notreal",
        json={"video_id": "abc123", "transcript": "x", "locale": "en"},
    )
    assert resp.status_code == 400


async def test_post_studio_empty_transcript_returns_422(client):
    resp = await client.post(
        "/api/tips/studio/summary",
        json={"video_id": "abc123", "transcript": "", "locale": "en"},
    )
    assert resp.status_code in (400, 422)


async def test_post_studio_invalid_locale_returns_422(client):
    resp = await client.post(
        "/api/tips/studio/summary",
        json={"video_id": "abc123", "transcript": "x", "locale": "fr"},
    )
    assert resp.status_code in (400, 422)


async def test_post_studio_upstream_error_returns_502(client, monkeypatch):
    monkeypatch.setattr(
        "app.tips.router._studio_svc.kick_off_studio_job",
        _fake_kick_off(status="error", step="error", error="openrouter down"),
    )

    resp = await client.post(
        "/api/tips/studio/summary",
        json={"video_id": "abc123", "transcript": "hi", "locale": "en"},
    )
    assert resp.status_code == 502
    body = resp.json()
    assert body["status"] == "error"
    assert "openrouter" in body["error"]


async def test_post_studio_cards_returns_valid_cards(client, monkeypatch):
    fake_data = {
        "cards": [
            {"id": "le-guo", "front": "了 vs 过?", "rule": "Completed action vs experience.",
             "example": "我吃了 vs 我吃过", "trap": "Not interchangeable."},
        ]
    }
    monkeypatch.setattr(
        "app.tips.router._studio_svc.kick_off_studio_job",
        _fake_kick_off(status="complete", step="complete", result={"data": fake_data}),
    )

    resp = await client.post(
        "/api/tips/studio/cards",
        json={"video_id": "abc123", "transcript": "lesson on le and guo", "locale": "en"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert len(body["data"]["cards"]) == 1
    assert body["data"]["cards"][0]["id"] == "le-guo"


# ---- Status probe (GET) tests -----------------------------------------------


async def test_get_studio_status_no_job_returns_200_none(client):
    resp = await client.get("/api/tips/studio/summary/abc123", params={"locale": "en"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "none"


async def test_get_studio_status_pending_after_post(client, monkeypatch):
    monkeypatch.setattr(
        "app.tips.router._studio_svc.kick_off_studio_job",
        _fake_kick_off(),
    )

    post_resp = await client.post(
        "/api/tips/studio/summary",
        json={"video_id": "abc123", "transcript": "hi", "locale": "en"},
    )
    assert post_resp.status_code == 202

    # Now resume via the probe — the same (kind, video_id, locale) tuple
    # surfaces the live job without spending a second OpenRouter call.
    probe = await client.get("/api/tips/studio/summary/abc123", params={"locale": "en"})
    assert probe.status_code == 202
    body = probe.json()
    assert body["status"] == "pending"
    assert body["jobId"].startswith("tip-studio-")


async def test_get_studio_status_ready_after_completion(client, monkeypatch):
    fake_data = {"abstract": "x" * 20, "takeaways": ["a", "b", "c"]}
    monkeypatch.setattr(
        "app.tips.router._studio_svc.kick_off_studio_job",
        _fake_kick_off(status="complete", step="complete", result={"data": fake_data}),
    )
    await client.post(
        "/api/tips/studio/summary",
        json={"video_id": "abc123", "transcript": "hi", "locale": "en"},
    )

    probe = await client.get("/api/tips/studio/summary/abc123", params={"locale": "en"})
    assert probe.status_code == 200
    body = probe.json()
    assert body["status"] == "ready"
    assert body["data"] == fake_data


async def test_get_studio_status_invalid_kind_returns_400(client):
    resp = await client.get("/api/tips/studio/notreal/abc123", params={"locale": "en"})
    assert resp.status_code == 400


async def test_get_studio_status_invalid_locale_returns_400(client):
    resp = await client.get("/api/tips/studio/summary/abc123", params={"locale": "fr"})
    assert resp.status_code == 400


async def test_get_studio_status_invalid_video_id_returns_400(client):
    resp = await client.get("/api/tips/studio/summary/!!!", params={"locale": "en"})
    assert resp.status_code == 400


async def test_get_studio_status_reads_the_catalog_when_no_job_is_live(client):
    fake_data = {"abstract": "x" * 20, "takeaways": ["a", "b", "c"]}
    await catalog.put_tip_studio("abc123", "summary", "en", fake_data)

    probe = await client.get("/api/tips/studio/summary/abc123", params={"locale": "en"})

    assert probe.status_code == 200
    assert probe.json() == {"status": "ready", "data": fake_data}
