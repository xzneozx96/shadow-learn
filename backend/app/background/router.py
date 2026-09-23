"""Job status polling and cleanup endpoints."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse, Response

from app.accounts.deps import CurrentUser
from app.accounts.models import User
from app.job_store import Job, jobs, prune_expired_jobs

router = APIRouter(prefix="/api/jobs")


def _visible_job(job_id: str, user: User) -> Job | None:
    job = jobs.get(job_id)
    if job is None or (job.user_id is not None and job.user_id != str(user.id)):
        return None
    return job


@router.get("/{job_id}")
async def get_job(job_id: str, user: CurrentUser):
    """Return current job status. Prunes expired jobs on every call."""
    prune_expired_jobs()
    job = _visible_job(job_id, user)
    if job is None:
        return JSONResponse(status_code=404, content={"detail": "Job not found"})
    return {
        "status": job.status,
        "step": job.step,
        "result": job.result,
        "error": job.error,
    }


@router.delete("/{job_id}", status_code=204)
async def delete_job(job_id: str, user: CurrentUser):
    """Remove a job from the store. Idempotent — no error if already gone."""
    if job_id in jobs and _visible_job(job_id, user) is None:
        return JSONResponse(status_code=404, content={"detail": "Job not found"})
    jobs.pop(job_id, None)
    return Response(status_code=204)
