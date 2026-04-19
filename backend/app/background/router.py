"""Job status polling and cleanup endpoints."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse, Response

from app.job_store import jobs, prune_expired_jobs

router = APIRouter(prefix="/api/jobs")


@router.get("/{job_id}")
async def get_job(job_id: str):
    """Return current job status. Prunes expired jobs on every call."""
    prune_expired_jobs()
    job = jobs.get(job_id)
    if job is None:
        return JSONResponse(status_code=404, content={"detail": "Job not found"})
    return {
        "status": job.status,
        "step": job.step,
        "result": job.result,
        "error": job.error,
    }


@router.delete("/{job_id}", status_code=204)
async def delete_job(job_id: str):
    """Remove a job from the store. Idempotent — no error if already gone."""
    jobs.pop(job_id, None)
    return Response(status_code=204)
