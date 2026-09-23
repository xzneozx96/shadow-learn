import uuid

import pytest
from sqlalchemy import func, text, update

from app.db import SessionLocal
from app.job_store import complete_job, fail_job, get_job, register_job, update_job
from app.jobs.models import JobRow

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest.fixture
def owner(stored_user):
    return stored_user.id


async def test_get_job_not_found(client, db_session):
    response = await client.get("/api/jobs/nonexistent")
    assert response.status_code == 404


async def test_get_job_processing(client, owner):
    job_id = await register_job(id_prefix="lesson", user_id=owner)
    await update_job(job_id, step="transcription")

    response = await client.get(f"/api/jobs/{job_id}")

    assert response.status_code == 200
    assert response.json() == {"status": "processing", "step": "transcription", "result": None, "error": None}


async def test_get_job_complete(client, owner):
    job_id = await register_job(id_prefix="lesson", user_id=owner)
    await complete_job(job_id, {"lesson": {"title": "Test", "segments": [], "duration": 60.0}})

    response = await client.get(f"/api/jobs/{job_id}")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "complete"
    assert data["result"]["lesson"]["title"] == "Test"


async def test_get_job_error(client, owner):
    job_id = await register_job(id_prefix="lesson", user_id=owner)
    await fail_job(job_id, "API timeout")

    response = await client.get(f"/api/jobs/{job_id}")

    assert response.status_code == 200
    assert (response.json()["status"], response.json()["error"]) == ("error", "API timeout")


async def test_delete_job(client, owner):
    job_id = await register_job(id_prefix="lesson", user_id=owner)

    response = await client.delete(f"/api/jobs/{job_id}")

    assert response.status_code == 204
    assert await get_job(job_id) is None


async def test_delete_job_idempotent(client, db_session):
    response = await client.delete("/api/jobs/nonexistent")
    assert response.status_code == 204


async def test_get_job_prunes_expired(client, owner):
    job_id = await register_job(id_prefix="lesson", user_id=owner)
    async with SessionLocal() as session:
        await session.execute(
            update(JobRow).where(JobRow.id == job_id).values(created_at=func.now() - text("interval '2 hours'"))
        )
        await session.commit()

    response = await client.get("/api/jobs/other")

    assert response.status_code == 404
    assert await get_job(job_id) is None


@pytest.mark.real_auth
async def test_job_is_hidden_from_other_users(client, db_session):
    from tests.conftest import register_and_login

    alice = await register_and_login(client, "alice@example.com")
    bob = await register_and_login(client, "bob@example.com")
    job_id = await register_job(id_prefix="lesson", user_id=uuid.UUID(alice["id"]))

    as_bob = await client.get(f"/api/jobs/{job_id}", headers={"Authorization": f"Bearer {bob['access_token']}"})
    assert as_bob.status_code == 404
    bob_delete = await client.delete(f"/api/jobs/{job_id}", headers={"Authorization": f"Bearer {bob['access_token']}"})
    assert bob_delete.status_code == 404
    as_alice = await client.get(f"/api/jobs/{job_id}", headers={"Authorization": f"Bearer {alice['access_token']}"})
    assert as_alice.status_code == 200


async def test_shared_job_is_readable_but_not_deletable(client, db_session):
    job_id = await register_job(id_prefix="tip-studio", user_id=None)

    read = await client.get(f"/api/jobs/{job_id}")
    delete = await client.delete(f"/api/jobs/{job_id}")

    assert read.status_code == 200
    assert delete.status_code == 404
    assert await get_job(job_id) is not None
