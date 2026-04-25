import time

import pytest
from httpx import ASGITransport, AsyncClient

import app.job_store as jobs_module
from app.main import app


@pytest.fixture(autouse=True)
def clear_jobs():
    jobs_module.jobs.clear()
    yield
    jobs_module.jobs.clear()


@pytest.mark.asyncio
async def test_get_job_not_found():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/jobs/nonexistent")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_job_processing():
    from app.job_store import Job

    jobs_module.jobs["abc"] = Job(
        status="processing", step="transcription", result=None, error=None
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/jobs/abc")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "processing"
    assert data["step"] == "transcription"
    assert data["result"] is None
    assert data["error"] is None


@pytest.mark.asyncio
async def test_get_job_complete():
    from app.job_store import Job

    result = {"lesson": {"title": "Test", "segments": [], "duration": 60.0}}
    jobs_module.jobs["xyz"] = Job(
        status="complete", step="assembling", result=result, error=None
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/jobs/xyz")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "complete"
    assert data["result"]["lesson"]["title"] == "Test"


@pytest.mark.asyncio
async def test_get_job_error():
    from app.job_store import Job

    jobs_module.jobs["err"] = Job(
        status="error", step="transcription", result=None, error="API timeout"
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/jobs/err")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"
    assert data["error"] == "API timeout"


@pytest.mark.asyncio
async def test_delete_job():
    from app.job_store import Job

    jobs_module.jobs["del"] = Job(
        status="processing", step="transcription", result=None, error=None
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.delete("/api/jobs/del")
    assert response.status_code == 204
    assert "del" not in jobs_module.jobs


@pytest.mark.asyncio
async def test_delete_job_idempotent():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.delete("/api/jobs/nonexistent")
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_get_job_prunes_expired():
    from app.job_store import Job

    jobs_module.jobs["old"] = Job(
        status="processing",
        step="transcription",
        result=None,
        error=None,
        created_at=time.time() - 7200,  # 2 hours ago
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/jobs/other")
    assert response.status_code == 404
    assert "old" not in jobs_module.jobs
