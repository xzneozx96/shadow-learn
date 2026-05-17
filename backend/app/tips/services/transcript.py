"""Tips transcript orchestrator.

Tries YouTube manual subtitles first (subtitle-fast path) and falls back to
async STT transcription when no subtitle track is available.  The two public
functions are called by the Tips transcript router (Task 7).

  fetch_youtube_subtitles — synchronous subtitle fetch; returns (lang, segments)
                            or (None, None) on any failure or absence.
  kick_off_stt_job        — spawns an asyncio background task that downloads the
                            video, extracts audio, runs STT, and writes the result
                            into the shared job store; returns the job_id string,
                            or None if no STT provider is configured.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any

from app.job_store import Job, jobs
from app.lessons.services.audio import (
    download_youtube_video,
    extract_audio_from_upload,
    get_youtube_metadata,
)
from app.lessons.services.youtube_subtitles import (
    download_subtitle_vtt,
    parse_vtt_to_segments,
    pick_manual_subtitle,
)
from app.transcription.services.transcription_deepgram import DeepgramSTTProvider
from app.transcription.services.transcription_provider import TranscriptionKeys

logger = logging.getLogger(__name__)

# Language preference order for Tips videos (English-explaining-Chinese content).
_SUBTITLE_LANG_PREFERENCE: list[str] = ["en", "vi", "zh-CN"]


async def fetch_youtube_subtitles(
    video_id: str,
) -> tuple[str | None, list[dict[str, Any]] | None]:
    """Try to fetch manual YouTube subtitles for *video_id*.

    Returns (yt_lang, segments) on success, or (None, None) when no suitable
    subtitle track exists or any error occurs.  The caller treats (None, None)
    as a signal to fall through to STT.
    """
    try:
        meta = await get_youtube_metadata(video_id)
        raw_subtitles = meta.get("subtitles")
        if not raw_subtitles:
            return (None, None)

        yt_lang: str | None = None
        for lang in _SUBTITLE_LANG_PREFERENCE:
            yt_lang = pick_manual_subtitle(raw_subtitles, lang)
            if yt_lang is not None:
                break

        if yt_lang is None:
            return (None, None)

        vtt = await download_subtitle_vtt(video_id, yt_lang)
        segments = parse_vtt_to_segments(vtt, yt_lang)

        if not segments:
            return (None, None)

        plain_segments = [
            {"start": s["start"], "end": s["end"], "text": s["text"]}
            for s in segments
        ]
        return (yt_lang, plain_segments)

    except Exception:
        logger.warning(
            "fetch_youtube_subtitles: failed for video_id=%s, falling through to STT",
            video_id,
            exc_info=True,
        )
        return (None, None)


async def kick_off_stt_job(video_id: str) -> str | None:
    """Spawn a background STT job for *video_id* and return the job_id.

    Returns None if no STT provider is configured (caller should treat as
    unavailable rather than raising).
    """
    # Tips always use Deepgram, regardless of the global SHADOWLEARN_STT_PROVIDER
    # setting — Deepgram is the cheapest + fastest path for Tips short-form content,
    # and we want Tips behavior to stay predictable even when lessons swap providers.
    try:
        stt_provider = DeepgramSTTProvider()
    except Exception:
        logger.warning(
            "kick_off_stt_job: Deepgram unavailable, cannot transcribe video_id=%s",
            video_id,
            exc_info=True,
        )
        return None

    job_id = f"tip-stt-{uuid.uuid4().hex[:12]}"
    jobs[job_id] = Job(status="processing", step="queued", result=None, error=None)

    async def _run() -> None:
        audio_path = None
        try:
            jobs[job_id].step = "video_download"
            video_path = await download_youtube_video(video_id)

            jobs[job_id].step = "audio_extraction"
            audio_path = await extract_audio_from_upload(video_path)

            jobs[job_id].step = "transcription"
            keys: TranscriptionKeys = {}
            segments = await stt_provider.transcribe(audio_path, keys, "en")

            jobs[job_id].step = "indexing"
            result_dict: dict[str, Any] = {
                "status": "ready",
                "source": "stt",
                "lang": "en",
                "segments": [
                    {"start": s["start"], "end": s["end"], "text": s["text"]}
                    for s in segments
                ],
            }
            jobs[job_id].result = result_dict
            jobs[job_id].status = "complete"

        except Exception as exc:
            logger.exception(
                "kick_off_stt_job._run: STT failed for job_id=%s video_id=%s",
                job_id,
                video_id,
            )
            jobs[job_id].status = "error"
            jobs[job_id].error = str(exc)

        finally:
            if audio_path is not None:
                try:
                    audio_path.unlink(missing_ok=True)
                except Exception:
                    pass

    asyncio.create_task(_run())
    return job_id
