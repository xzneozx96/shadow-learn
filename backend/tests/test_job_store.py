"""Tests for the shared job primitive in ``app/job_store.py``."""
from __future__ import annotations

import asyncio

import pytest

from app.job_store import (
    Job,
    _keyed_jobs,
    clear_keyed_job,
    get_job_for_key,
    jobs,
    kick_off_job,
    kick_off_keyed_job,
    prune_expired_jobs,
    register_job,
    register_keyed_job,
)


@pytest.fixture(autouse=True)
def _reset_state() -> None:
    """Snapshot + restore the global job registries so tests don't leak."""
    jobs.clear()
    _keyed_jobs.clear()
    yield
    jobs.clear()
    _keyed_jobs.clear()


async def _await_terminal(job_id: str, *, timeout: float = 1.0) -> None:
    """Drive the event loop until *job_id* reaches a terminal state."""
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        job = jobs.get(job_id)
        if job is not None and job.status in {"complete", "error"}:
            return
        await asyncio.sleep(0.01)
    raise AssertionError(f"job {job_id} did not finish in {timeout}s")


def test_register_job_mints_processing_row() -> None:
    job_id = register_job(id_prefix="x")
    assert job_id.startswith("x-")
    assert jobs[job_id].status == "processing"
    assert jobs[job_id].step == "queued"


def test_register_keyed_job_and_get() -> None:
    job_id = register_job(id_prefix="t")
    register_keyed_job("k1", job_id)
    assert get_job_for_key("k1") == job_id


def test_get_job_for_key_drops_pruned_entries() -> None:
    register_keyed_job("k1", "missing-id")
    assert get_job_for_key("k1") is None
    assert "k1" not in _keyed_jobs


def test_get_job_for_key_drops_errored_entries() -> None:
    job_id = register_job(id_prefix="t")
    jobs[job_id] = Job(status="error", step="failed", result=None, error="boom")
    register_keyed_job("k1", job_id)
    assert get_job_for_key("k1") is None
    assert "k1" not in _keyed_jobs


def test_clear_keyed_job_is_idempotent() -> None:
    clear_keyed_job("missing")  # must not raise
    register_keyed_job("k", "j")
    clear_keyed_job("k")
    assert "k" not in _keyed_jobs


async def test_kick_off_job_runs_runner_to_completion() -> None:
    async def runner(job_id: str) -> None:
        jobs[job_id].result = {"ok": True}
        jobs[job_id].status = "complete"
        jobs[job_id].step = "complete"

    job_id = kick_off_job(runner, id_prefix="test")
    await _await_terminal(job_id)
    assert jobs[job_id].status == "complete"
    assert jobs[job_id].result == {"ok": True}


async def test_kick_off_job_records_runner_exceptions_as_error() -> None:
    async def runner(_job_id: str) -> None:
        raise RuntimeError("oops")

    job_id = kick_off_job(runner, id_prefix="test")
    await _await_terminal(job_id)
    assert jobs[job_id].status == "error"
    assert "oops" in (jobs[job_id].error or "")


async def test_kick_off_keyed_job_dedupes() -> None:
    runs: list[str] = []

    async def runner(job_id: str) -> None:
        runs.append(job_id)
        await asyncio.sleep(0.05)  # stay "processing" long enough to dedupe
        jobs[job_id].status = "complete"

    first = kick_off_keyed_job("artifact:abc", runner, id_prefix="test")
    second = kick_off_keyed_job("artifact:abc", runner, id_prefix="test")
    assert first == second
    await _await_terminal(first)
    assert len(runs) == 1  # runner invoked exactly once


async def test_kick_off_keyed_job_spawns_fresh_after_error() -> None:
    """An errored job should not block a fresh attempt for the same key."""
    async def fail(job_id: str) -> None:
        jobs[job_id].status = "error"
        jobs[job_id].error = "first attempt failed"

    async def ok(job_id: str) -> None:
        jobs[job_id].status = "complete"
        jobs[job_id].result = {"value": 42}

    first = kick_off_keyed_job("k", fail, id_prefix="t")
    await _await_terminal(first)
    second = kick_off_keyed_job("k", ok, id_prefix="t")
    assert second != first
    await _await_terminal(second)
    assert jobs[second].result == {"value": 42}


def test_prune_expired_jobs_removes_old_rows_and_keys() -> None:
    job_id = register_job(id_prefix="t")
    register_keyed_job("k", job_id)
    # Force the row to look ancient.
    jobs[job_id].created_at -= 7200  # 2h
    prune_expired_jobs(max_age_seconds=3600)
    assert job_id not in jobs
    assert "k" not in _keyed_jobs
