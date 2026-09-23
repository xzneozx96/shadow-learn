"""Persisted background-job primitive shared by every feature.

Jobs live in the ``jobs`` table, so a completed job survives a restart and
keeps answering ``GET /api/jobs/{id}``. A job's ``key`` dedupes in-flight
work by content identity (e.g. ``"tip-stt:VIDEOID"`` or
``"tip-studio:KIND:VIDEOID:LOCALE"``) through the partial unique index
``uq_jobs_live_key``, which ignores errored rows.

Runners still execute in-process through ``asyncio.create_task``, so the
backend runs one uvicorn worker. On startup ``mark_interrupted_jobs`` fails
every job the previous process left in ``processing``.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert

from app.db import SessionLocal
from app.jobs.models import LIVE_KEY_PREDICATE, JobRow

logger = logging.getLogger(__name__)

Runner = Callable[[str], Awaitable[None]]


def _mint_job_id(id_prefix: str) -> str:
    return f"{id_prefix}-{uuid.uuid4().hex[:12]}"


async def get_job(job_id: str) -> JobRow | None:
    async with SessionLocal() as session:
        return await session.get(JobRow, job_id)


async def update_job(job_id: str, **values: Any) -> None:
    async with SessionLocal() as session:
        await session.execute(update(JobRow).where(JobRow.id == job_id).values(**values))
        await session.commit()


async def complete_job(job_id: str, result: dict[str, Any]) -> None:
    await update_job(job_id, status="complete", step="complete", result=result)


async def fail_job(job_id: str, error: str) -> None:
    await update_job(job_id, status="error", error=error)


async def delete_job(job_id: str) -> None:
    async with SessionLocal() as session:
        await session.execute(delete(JobRow).where(JobRow.id == job_id))
        await session.commit()


async def prune_expired_jobs(max_age_seconds: float = 3600.0) -> None:
    """Delete jobs older than *max_age_seconds*. Called on every poll request."""
    cutoff = func.now() - timedelta(seconds=max_age_seconds)
    async with SessionLocal() as session:
        await session.execute(delete(JobRow).where(JobRow.created_at < cutoff))
        await session.commit()


async def mark_interrupted_jobs() -> None:
    """Fail every job a previous process left running. Called once at startup."""
    async with SessionLocal() as session:
        await session.execute(
            update(JobRow).where(JobRow.status == "processing").values(status="error", error="server restarted")
        )
        await session.commit()


async def get_job_for_key(key: str) -> str | None:
    """Return the id of the live (processing or complete) job for *key*, or ``None``."""
    async with SessionLocal() as session:
        return await session.scalar(select(JobRow.id).where(JobRow.key == key, LIVE_KEY_PREDICATE))


async def register_keyed_job(key: str, job_id: str) -> None:
    await update_job(job_id, key=key)


async def clear_keyed_job(key: str) -> None:
    """Detach *key* from its live job so the next keyed kick-off spawns fresh work."""
    async with SessionLocal() as session:
        await session.execute(update(JobRow).where(JobRow.key == key, LIVE_KEY_PREDICATE).values(key=None))
        await session.commit()


async def register_job(id_prefix: str = "job", *, user_id: uuid.UUID | None) -> str:
    """Mint a new job id and insert a queued row. Return the id.

    Callers that schedule their own runner (e.g. FastAPI ``BackgroundTasks``)
    use this instead of :func:`kick_off_job`.
    """
    job_id = _mint_job_id(id_prefix)
    async with SessionLocal() as session:
        session.add(JobRow(id=job_id, user_id=user_id, status="processing", step="queued"))
        await session.commit()
    return job_id


async def kick_off_job(runner: Runner, *, id_prefix: str = "job", user_id: uuid.UUID | None) -> str:
    """Insert a fresh job and schedule *runner(job_id)* in the background."""
    job_id = await register_job(id_prefix, user_id=user_id)
    asyncio.create_task(_run_with_guard(job_id, runner))
    return job_id


async def kick_off_keyed_job(
    key: str,
    runner: Runner,
    *,
    id_prefix: str = "job",
    user_id: uuid.UUID | None,
) -> str:
    """Like :func:`kick_off_job` but dedupes by *key*.

    The insert and the partial unique index decide the race: when a live job
    already holds *key*, its id is returned and no runner is scheduled.
    """
    while True:
        job_id = _mint_job_id(id_prefix)
        async with SessionLocal() as session:
            inserted = await session.scalar(
                insert(JobRow)
                .values(id=job_id, user_id=user_id, key=key, status="processing", step="queued")
                .on_conflict_do_nothing(index_elements=[JobRow.key], index_where=LIVE_KEY_PREDICATE)
                .returning(JobRow.id)
            )
            existing = None
            if inserted is None:
                existing = await session.scalar(select(JobRow.id).where(JobRow.key == key, LIVE_KEY_PREDICATE))
            await session.commit()
        if inserted is not None:
            asyncio.create_task(_run_with_guard(job_id, runner))
            return job_id
        if existing is not None:
            logger.info("kick_off_keyed_job: reusing job_id=%s for key=%s", existing, key)
            return existing


async def _run_with_guard(job_id: str, runner: Runner) -> None:
    """Invoke *runner* and record an unhandled exception on the job."""
    try:
        await runner(job_id)
    except Exception as e:
        logger.exception("background job %s crashed", job_id)
        async with SessionLocal() as session:
            await session.execute(
                update(JobRow)
                .where(JobRow.id == job_id, JobRow.status == "processing")
                .values(status="error", error=str(e))
            )
            await session.commit()
