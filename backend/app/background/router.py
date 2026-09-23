"""Job status polling and cleanup endpoints."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse, Response

from app.accounts.deps import CurrentUser
from app.accounts.models import User
from app.job_store import delete_job, get_job, prune_expired_jobs
from app.jobs.models import JobRow

router = APIRouter(prefix="/api/jobs")


async def _visible_job(job_id: str, user: User) -> JobRow | None:
    job = await get_job(job_id)
    if job is None or (job.user_id is not None and job.user_id != user.id):
        return None
    return job


@router.get("/{job_id}")
async def get_job_status(job_id: str, user: CurrentUser):
    """Return current job status. Prunes expired jobs on every call."""
    await prune_expired_jobs()
    job = await _visible_job(job_id, user)
    if job is None:
        return JSONResponse(status_code=404, content={"detail": "Job not found"})
    return {
        "status": job.status,
        "step": job.step,
        "result": job.result,
        "error": job.error,
    }


@router.delete("/{job_id}", status_code=204)
async def delete_job_route(job_id: str, user: CurrentUser):
    """Remove the caller's job from the store. Idempotent — no error if already gone."""
    job = await get_job(job_id)
    if job is not None and job.user_id != user.id:
        return JSONResponse(status_code=404, content={"detail": "Job not found"})
    if job is not None:
        await delete_job(job_id)
    return Response(status_code=204)
