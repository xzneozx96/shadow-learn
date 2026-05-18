"""HTTP route for tips transcript fetching."""
from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import app.tips.services.studio as _studio_svc
import app.tips.services.transcript as _transcript_svc
from app.job_store import get_job_for_key, jobs
from app.tips.schemas import StudioRequest

router = APIRouter(prefix="/api/tips", tags=["tips"])

_VALID_KINDS = {"summary", "study_guide", "cards", "mind_map"}

_YOUTUBE_ID = re.compile(r"^[A-Za-z0-9_-]{6,32}$")


class TranscriptReady(BaseModel):
    status: str
    source: str
    lang: str | None
    segments: list[dict]


class TranscriptPending(BaseModel):
    status: str
    jobId: str


class TranscriptUnavailable(BaseModel):
    status: str


class TranscriptTooLong(BaseModel):
    status: str
    durationSec: float
    limitSec: int


@router.get("/transcript/{video_id}")
async def get_transcript(video_id: str):
    if not _YOUTUBE_ID.match(video_id):
        raise HTTPException(status_code=400, detail="invalid video_id")

    # Fast path: if a previous STT job for this video already completed and
    # is still in memory, return its result immediately. Skips ~5s of yt-dlp
    # metadata + subtitle probing on every repeat request. The frontend then
    # caches to IDB so future opens are instant even after the in-memory
    # job is pruned.
    cached_job_id = _transcript_svc._existing_job_for_video(video_id)
    if cached_job_id is not None:
        from app.job_store import jobs as _jobs
        cached = _jobs.get(cached_job_id)
        if cached is not None and cached.status == "complete" and cached.result is not None:
            result = cached.result
            return TranscriptReady(
                status="ready",
                source=result.get("source", "stt"),
                lang=result.get("lang"),
                segments=result.get("segments", []),
            )
        # Job still processing — frontend can resume polling it.
        if cached is not None and cached.status == "processing":
            return JSONResponse(
                status_code=202,
                content=TranscriptPending(status="pending", jobId=cached_job_id).model_dump(),
            )

    try:
        duration, too_long = await _transcript_svc.check_video_duration(video_id)
    except Exception:
        # If yt-dlp metadata fails, fall through to the normal subtitle path
        # (which has its own error handling). Don't block on a flaky probe.
        duration, too_long = 0.0, False
    if too_long:
        return TranscriptTooLong(
            status="too_long",
            durationSec=duration,
            limitSec=_transcript_svc.MAX_TIP_VIDEO_DURATION_SEC,
        )

    lang, segments = await _transcript_svc.fetch_youtube_subtitles(video_id)
    if segments is not None:
        return TranscriptReady(status="ready", source="subtitle", lang=lang, segments=segments)

    job_id = await _transcript_svc.kick_off_stt_job(video_id)
    if job_id:
        return JSONResponse(
            status_code=202,
            content=TranscriptPending(status="pending", jobId=job_id).model_dump(),
        )

    return JSONResponse(
        status_code=404,
        content=TranscriptUnavailable(status="unavailable").model_dump(),
    )


def _studio_response_for_job(job_id: str) -> JSONResponse:
    """Translate a backend Job into the wire shape the studio client expects.

    Shape mirrors the transcript flow: 200 ``ready`` with data, 202
    ``pending``, 502 ``error``. Job pruning + dedupe keep the source of truth
    on the backend so the client never has to persist jobIds.
    """
    job = jobs[job_id]
    if job.status == "complete":
        return JSONResponse(
            status_code=200,
            content={"status": "ready", "jobId": job_id, "data": (job.result or {}).get("data")},
        )
    if job.status == "error":
        return JSONResponse(
            status_code=502,
            content={"status": "error", "jobId": job_id, "error": job.error or "unknown error"},
        )
    return JSONResponse(
        status_code=202,
        content={"status": "pending", "jobId": job_id},
    )


@router.post("/studio/{kind}")
async def post_studio(kind: str, req: StudioRequest):
    """Trigger (or join) a studio-artifact generation job.

    Behavior:
      - If a live job already exists for ``(kind, video_id, locale)``, no new
        OpenRouter call is made; the existing job's current state is
        returned (ready / pending). This is what lets two tabs / a reload
        avoid spawning duplicate work.
      - Otherwise a background job is kicked off and ``202 {jobId}`` is
        returned. The client polls ``GET /api/jobs/{job_id}``.
    """
    if kind not in _VALID_KINDS:
        raise HTTPException(status_code=400, detail=f"invalid kind: {kind}")

    job_id = _studio_svc.kick_off_studio_job(
        kind=kind,  # type: ignore[arg-type]
        video_id=req.video_id,
        transcript=req.transcript,
        locale=req.locale,
    )
    return _studio_response_for_job(job_id)


@router.get("/studio/{kind}/{video_id}")
async def get_studio_status(kind: str, video_id: str, locale: str = "en"):
    """Status probe used by the client on mount / reload.

    Looks up any live job for ``(kind, video_id, locale)`` without spending
    an OpenRouter call. Returns ``ready`` / ``pending`` / ``404 none``. This
    is the analog of ``GET /api/tips/transcript/{video_id}`` — content-keyed
    lookup is the resume mechanism, no client-side jobId persistence needed.
    """
    if kind not in _VALID_KINDS:
        raise HTTPException(status_code=400, detail=f"invalid kind: {kind}")
    if locale not in {"en", "vi"}:
        raise HTTPException(status_code=400, detail=f"invalid locale: {locale}")
    if not _YOUTUBE_ID.match(video_id):
        raise HTTPException(status_code=400, detail="invalid video_id")

    key = _studio_svc.studio_job_key(kind, video_id, locale)  # type: ignore[arg-type]
    job_id = get_job_for_key(key)
    if job_id is None:
        return JSONResponse(status_code=404, content={"status": "none"})
    return _studio_response_for_job(job_id)
