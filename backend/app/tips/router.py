"""HTTP route for tips transcript fetching."""
from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import app.tips.services.studio as _studio_svc
import app.tips.services.transcript as _transcript_svc
from app.tips.schemas import (
    StudioCards,
    StudioRequest,
    StudioStudyGuide,
    StudioSummary,
)

router = APIRouter(prefix="/api/tips", tags=["tips"])

_VALID_KINDS = {"summary", "study_guide", "cards"}

_KIND_TO_MODEL = {
    "summary": StudioSummary,
    "study_guide": StudioStudyGuide,
    "cards": StudioCards,
}

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


@router.post("/studio/{kind}")
async def post_studio(kind: str, req: StudioRequest):
    if kind not in _VALID_KINDS:
        raise HTTPException(status_code=400, detail=f"invalid kind: {kind}")

    try:
        raw = await _studio_svc.generate_studio_artifact(
            kind=kind,  # type: ignore[arg-type]
            transcript=req.transcript,
            locale=req.locale,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=f"upstream error: {e}") from e

    # Validate the LLM output against the per-kind Pydantic model. If the
    # LLM returned malformed JSON, surface a 502 (we cannot trust the
    # response and the client cannot recover by retrying with the same input).
    model = _KIND_TO_MODEL[kind]
    try:
        validated = model.model_validate(raw)
    except Exception as e:  # pydantic ValidationError
        raise HTTPException(
            status_code=502,
            detail=f"upstream returned invalid schema: {e}",
        ) from e
    return validated.model_dump()
