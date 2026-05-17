"""HTTP route for tips transcript fetching."""
from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import app.tips.services.transcript as _transcript_svc

router = APIRouter(prefix="/api/tips", tags=["tips"])

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


@router.get("/transcript/{video_id}")
async def get_transcript(video_id: str):
    if not _YOUTUBE_ID.match(video_id):
        raise HTTPException(status_code=400, detail="invalid video_id")

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
