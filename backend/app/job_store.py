"""In-memory background-job primitive shared by every feature.

This module owns the project's canonical job machinery:

  - The ``Job`` dataclass and ``jobs`` registry.
  - ``prune_expired_jobs`` to drop stale rows after a TTL.
  - ``kick_off_job`` / ``kick_off_keyed_job`` to spawn a background coroutine
    and track its lifecycle in one call.
  - A small key → job_id index (``_keyed_jobs``) that lets features dedupe
    in-flight work by content-identity (e.g. ``"tip-stt:VIDEOID"`` or
    ``"tip-studio:KIND:VIDEOID:LOCALE"``). Same primitive transcript STT and
    studio artifact generation use to support reload-resume without any
    client-side jobId persistence.

Caveats:

  - State lives in-process. A backend restart loses all jobs and the keyed
    index. Acceptable for current scale; swap for Redis / Postgres when it
    isn't.
  - Single uvicorn process only. Multi-worker (``--workers N``) would split
    the dict per process and break dedupe + polling.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class Job:
    status: str          # "processing" | "complete" | "error"
    step: str            # feature-defined. "queued" on creation; "complete" on terminal success.
    result: dict[str, Any] | None  # feature-defined payload when status == "complete"; None otherwise
    error: str | None    # error message if status == "error"; None otherwise
    created_at: float = field(default_factory=time.time)


jobs: dict[str, Job] = {}

# Maps an arbitrary content key → job_id. Namespace keys per feature, e.g.
# ``tip-stt:VIDEOID`` or ``tip-studio:KIND:VIDEOID:LOCALE``. Stale entries
# (pruned job, errored job) are cleared lazily on lookup so callers spawn a
# fresh job instead of resuming a dead one.
_keyed_jobs: dict[str, str] = {}


def prune_expired_jobs(max_age_seconds: float = 3600.0) -> None:
    """Remove jobs older than *max_age_seconds*. Called on every poll request."""
    now = time.time()
    expired = [jid for jid, job in jobs.items() if now - job.created_at > max_age_seconds]
    for jid in expired:
        del jobs[jid]
    # Drop keyed-job entries that point at a pruned id.
    stale_keys = [k for k, jid in _keyed_jobs.items() if jid not in jobs]
    for k in stale_keys:
        del _keyed_jobs[k]


def get_job_for_key(key: str) -> str | None:
    """Return job_id of a still-usable job for *key*, or ``None``.

    "Usable" means the underlying Job exists and isn't in the ``error``
    state. Stale entries are dropped from the index as a side effect so the
    next call observes a clean slate.
    """
    job_id = _keyed_jobs.get(key)
    if job_id is None:
        return None
    job = jobs.get(job_id)
    if job is None:
        _keyed_jobs.pop(key, None)
        return None
    if job.status == "error":
        _keyed_jobs.pop(key, None)
        return None
    return job_id


def register_keyed_job(key: str, job_id: str) -> None:
    """Bind *key* → *job_id* in the keyed-job index."""
    _keyed_jobs[key] = job_id


def clear_keyed_job(key: str) -> None:
    """Drop *key* from the keyed-job index. Safe to call when key absent."""
    _keyed_jobs.pop(key, None)


def _mint_job_id(id_prefix: str) -> str:
    return f"{id_prefix}-{uuid.uuid4().hex[:12]}"


def register_job(id_prefix: str = "job") -> str:
    """Mint a new job_id and create a queued Job row. Return the id.

    Callers that schedule background work through a non-asyncio mechanism
    (e.g. FastAPI ``BackgroundTasks``) use this to grab a job_id + Job row
    without the asyncio task spawning that :func:`kick_off_job` does. The
    caller is then responsible for scheduling its own runner and mutating
    ``jobs[job_id]`` as work progresses.
    """
    job_id = _mint_job_id(id_prefix)
    jobs[job_id] = Job(status="processing", step="queued", result=None, error=None)
    return job_id


Runner = Callable[[str], Awaitable[None]]


def kick_off_job(runner: Runner, *, id_prefix: str = "job") -> str:
    """Create a fresh ``Job`` and schedule *runner(job_id)* in the background.

    ``runner`` is responsible for mutating ``jobs[job_id]`` — setting ``step``
    as work progresses, then either ``status="complete"`` + ``result=...`` or
    ``status="error"`` + ``error=...`` when it finishes. Exceptions raised
    out of ``runner`` are caught here and recorded on the Job as a last-resort
    safety net so a buggy runner never silently leaves a Job pinned in
    ``processing``.
    """
    job_id = _mint_job_id(id_prefix)
    jobs[job_id] = Job(status="processing", step="queued", result=None, error=None)
    asyncio.create_task(_run_with_guard(job_id, runner))
    return job_id


def kick_off_keyed_job(
    key: str,
    runner: Runner,
    *,
    id_prefix: str = "job",
) -> str:
    """Like :func:`kick_off_job` but dedupes by *key*.

    If a live job already exists for *key* (status ``processing`` or
    ``complete``), returns its id without scheduling a new runner. Otherwise
    mints a new id, registers ``key → id`` in the keyed-job index, and
    schedules ``runner(job_id)``.
    """
    existing = get_job_for_key(key)
    if existing is not None:
        logger.info(
            "kick_off_keyed_job: reusing job_id=%s for key=%s (status=%s)",
            existing, key, jobs[existing].status,
        )
        return existing
    job_id = _mint_job_id(id_prefix)
    jobs[job_id] = Job(status="processing", step="queued", result=None, error=None)
    register_keyed_job(key, job_id)
    asyncio.create_task(_run_with_guard(job_id, runner))
    return job_id


async def _run_with_guard(job_id: str, runner: Runner) -> None:
    """Invoke *runner* and absorb unhandled exceptions onto the Job record."""
    try:
        await runner(job_id)
    except Exception as e:  # noqa: BLE001 — last-resort guard
        logger.exception("background job %s crashed: %s", job_id, e)
        job = jobs.get(job_id)
        if job is not None and job.status == "processing":
            job.status = "error"
            job.error = str(e)
