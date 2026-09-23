"""HTTP route for tips transcript fetching."""
from __future__ import annotations

import logging
import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import app.tips.services.studio as _studio_svc
import app.tips.services.transcript as _transcript_svc
from app.catalog import service as catalog
from app.job_store import get_job, get_job_for_key
from app.tips.schemas import StudioRequest

logger = logging.getLogger(__name__)

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

    cached = await catalog.get_tip_transcript(video_id)
    if cached is not None:
        return TranscriptReady(status="ready", **cached)

    running_job_id = await _transcript_svc._existing_job_for_video(video_id)
    if running_job_id is not None:
        running = await get_job(running_job_id)
        if running is not None and running.status == "processing":
            return JSONResponse(
                status_code=202,
                content=TranscriptPending(status="pending", jobId=running_job_id).model_dump(),
            )

    try:
        duration, too_long = await _transcript_svc.check_video_duration(video_id)
    except Exception:
        # If yt-dlp metadata fails, fall through to the normal subtitle path
        # (which has its own error handling). Don't block on a flaky probe.
        logger.warning("tips transcript: duration probe failed for video_id=%s", video_id, exc_info=True)
        duration, too_long = 0.0, False
    if too_long:
        return TranscriptTooLong(
            status="too_long",
            durationSec=duration,
            limitSec=_transcript_svc.MAX_TIP_VIDEO_DURATION_SEC,
        )

    lang, segments = await _transcript_svc.fetch_youtube_subtitles(video_id)
    if segments is not None:
        await catalog.put_tip_transcript(video_id, {"source": "subtitle", "lang": lang, "segments": segments})
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


async def _studio_response_for_job(job_id: str) -> JSONResponse:
    """Translate a backend Job into the wire shape the studio client expects.

    Shape mirrors the transcript flow: 200 ``ready`` with data, 202
    ``pending``, 502 ``error``. Job pruning + dedupe keep the source of truth
    on the backend so the client never has to persist jobIds.
    """
    job = await get_job(job_id)
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

    job_id = await _studio_svc.kick_off_studio_job(
        kind=kind,  # type: ignore[arg-type]
        video_id=req.video_id,
        transcript=req.transcript,
        locale=req.locale,
    )
    return await _studio_response_for_job(job_id)


@router.get("/studio/{kind}/{video_id}")
async def get_studio_status(kind: str, video_id: str, locale: str = "en"):
    """Status probe used by the client on mount / reload.

    Looks up any live job for ``(kind, video_id, locale)``, then the studio
    catalog, without spending an OpenRouter call. Returns ``ready`` /
    ``pending`` / ``none``.
    """
    if kind not in _VALID_KINDS:
        raise HTTPException(status_code=400, detail=f"invalid kind: {kind}")
    if locale not in {"en", "vi"}:
        raise HTTPException(status_code=400, detail=f"invalid locale: {locale}")
    if not _YOUTUBE_ID.match(video_id):
        raise HTTPException(status_code=400, detail="invalid video_id")

    key = _studio_svc.studio_job_key(kind, video_id, locale)  # type: ignore[arg-type]
    job_id = await get_job_for_key(key)
    if job_id is not None:
        return await _studio_response_for_job(job_id)
    cached = await catalog.get_tip_studio(video_id, kind, locale)
    if cached is not None:
        return JSONResponse(status_code=200, content={"status": "ready", "data": cached})
    return JSONResponse(status_code=200, content={"status": "none"})
