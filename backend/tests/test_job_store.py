"""Tests for the persisted job primitive in ``app/job_store.py``."""
from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import func, select, text, update

from app.db import SessionLocal
from app.job_store import (
    clear_keyed_job,
    complete_job,
    fail_job,
    get_job,
    get_job_for_key,
    kick_off_job,
    kick_off_keyed_job,
    mark_interrupted_jobs,
    prune_expired_jobs,
    register_job,
    register_keyed_job,
)
from app.jobs.models import JobRow

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.usefixtures("db_session")]


async def _await_terminal(job_id: str, *, timeout: float = 2.0) -> JobRow:
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        job = await get_job(job_id)
        if job is not None and job.status in {"complete", "error"}:
            return job
        await asyncio.sleep(0.01)
    raise AssertionError(f"job {job_id} did not finish in {timeout}s")


async def test_register_job_persists_a_processing_row() -> None:
    job_id = await register_job(id_prefix="x", user_id=None)

    async with SessionLocal() as fresh:
        row = await fresh.get(JobRow, job_id)

    assert job_id.startswith("x-")
    assert (row.status, row.step) == ("processing", "queued")


async def test_completed_job_is_readable_from_a_new_session() -> None:
    job_id = await register_job(id_prefix="x", user_id=None)
    await complete_job(job_id, {"lesson": {"title": "t"}})

    async with SessionLocal() as fresh:
        row = await fresh.get(JobRow, job_id)

    assert (row.status, row.step, row.result) == ("complete", "complete", {"lesson": {"title": "t"}})


async def test_startup_marks_processing_jobs_as_server_restarted() -> None:
    running = await register_job(id_prefix="x", user_id=None)
    done = await register_job(id_prefix="x", user_id=None)
    await complete_job(done, {"ok": True})

    await mark_interrupted_jobs()

    interrupted = await get_job(running)
    assert (interrupted.status, interrupted.error) == ("error", "server restarted")
    assert (await get_job(done)).status == "complete"


async def test_register_keyed_job_and_get() -> None:
    job_id = await register_job(id_prefix="t", user_id=None)
    await register_keyed_job("k1", job_id)
    assert await get_job_for_key("k1") == job_id


async def test_get_job_for_key_ignores_errored_jobs() -> None:
    job_id = await register_job(id_prefix="t", user_id=None)
    await register_keyed_job("k1", job_id)
    await fail_job(job_id, "boom")
    assert await get_job_for_key("k1") is None


async def test_clear_keyed_job_is_idempotent() -> None:
    await clear_keyed_job("missing")
    job_id = await register_job(id_prefix="t", user_id=None)
    await register_keyed_job("k", job_id)
    await clear_keyed_job("k")
    assert await get_job_for_key("k") is None


async def test_kick_off_job_runs_runner_to_completion() -> None:
    async def runner(job_id: str) -> None:
        await complete_job(job_id, {"ok": True})

    job_id = await kick_off_job(runner, id_prefix="test", user_id=None)
    job = await _await_terminal(job_id)
    assert (job.status, job.result) == ("complete", {"ok": True})


async def test_kick_off_job_records_runner_exceptions_as_error() -> None:
    async def runner(_job_id: str) -> None:
        raise RuntimeError("oops")

    job_id = await kick_off_job(runner, id_prefix="test", user_id=None)
    job = await _await_terminal(job_id)
    assert job.status == "error"
    assert "oops" in (job.error or "")


async def test_concurrent_keyed_kick_offs_share_one_job_and_one_runner() -> None:
    runs: list[str] = []

    async def runner(job_id: str) -> None:
        runs.append(job_id)
        await asyncio.sleep(0.05)
        await complete_job(job_id, {})

    ids = await asyncio.gather(
        *(kick_off_keyed_job("artifact:abc", runner, id_prefix="test", user_id=None) for _ in range(5))
    )
    await _await_terminal(ids[0])

    async with SessionLocal() as fresh:
        count = await fresh.scalar(select(func.count()).select_from(JobRow).where(JobRow.key == "artifact:abc"))
    assert len(set(ids)) == 1
    assert runs == [ids[0]]
    assert count == 1


async def test_kick_off_keyed_job_spawns_fresh_after_error() -> None:
    async def fail(job_id: str) -> None:
        await fail_job(job_id, "first attempt failed")

    async def ok(job_id: str) -> None:
        await complete_job(job_id, {"value": 42})

    first = await kick_off_keyed_job("k", fail, id_prefix="t", user_id=None)
    await _await_terminal(first)
    second = await kick_off_keyed_job("k", ok, id_prefix="t", user_id=None)
    assert second != first
    assert (await _await_terminal(second)).result == {"value": 42}


async def test_prune_expired_jobs_deletes_rows_older_than_the_limit() -> None:
    old = await register_job(id_prefix="t", user_id=None)
    fresh = await register_job(id_prefix="t", user_id=None)
    async with SessionLocal() as session:
        await session.execute(
            update(JobRow).where(JobRow.id == old).values(created_at=func.now() - text("interval '2 hours'"))
        )
        await session.commit()

    await prune_expired_jobs(max_age_seconds=3600)

    assert await get_job(old) is None
    assert await get_job(fresh) is not None
