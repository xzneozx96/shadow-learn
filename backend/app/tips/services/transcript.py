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

# Default fallback preference order if we can't detect the video's language.
_FALLBACK_LANG_PREFERENCE: list[str] = ["en", "vi", "zh-CN"]

# Hard cap on Tips video duration. Beyond this, we never run STT or LLM
# Summary — both scale linearly with audio length and the LLM prompts include
# the full transcript. 30 minutes is a comfortable upper bound for "tip"
# content (most are 3–10 min).
MAX_TIP_VIDEO_DURATION_SEC: int = 30 * 60


async def check_video_duration(video_id: str) -> tuple[float, bool]:
    """Return (duration_sec, is_over_limit) for *video_id*.

    Uses yt-dlp metadata. If duration can't be determined, returns 0.0 and
    treats the video as within the limit (callers fall through to the normal
    subtitle/STT path, which has its own failure handling).
    """
    meta = await get_youtube_metadata(video_id)
    duration = float(meta.get("duration") or 0.0)
    return duration, duration > MAX_TIP_VIDEO_DURATION_SEC


def _build_lang_preference(detected: str | None) -> list[str]:
    """Build subtitle preference: detected language first, then fallback order."""
    if not detected:
        return _FALLBACK_LANG_PREFERENCE
    # Normalize common forms (vi-VN → vi, zh-Hans → zh-CN-ish; just take prefix).
    norm = detected.split("-")[0].lower() if "-" not in detected.lower() else detected
    short = detected.split("-")[0].lower()
    pref = [detected, norm, short]
    # De-dupe while preserving order, then append fallbacks not yet in the list.
    seen: set[str] = set()
    out: list[str] = []
    for x in [*pref, *_FALLBACK_LANG_PREFERENCE]:
        if x and x not in seen:
            out.append(x)
            seen.add(x)
    return out


async def fetch_youtube_subtitles(
    video_id: str,
) -> tuple[str | None, list[dict[str, Any]] | None]:
    """Try to fetch YouTube subtitles for *video_id* in the video's language.

    Returns (yt_lang, segments) on success, or (None, None) when no suitable
    subtitle track exists.
    """
    try:
        meta = await get_youtube_metadata(video_id)
        detected_lang: str | None = meta.get("language")
        raw_subtitles = meta.get("subtitles") or {}
        raw_auto = meta.get("automatic_captions") or {}

        if not raw_subtitles and not raw_auto:
            return (None, None)

        lang_pref = _build_lang_preference(detected_lang)

        # Phase 1: try manual subtitles in preferred order.
        yt_lang: str | None = None
        for lang in lang_pref:
            yt_lang = pick_manual_subtitle(raw_subtitles, lang)
            if yt_lang is not None:
                break

        # Phase 2: if no manual, try auto-captions in the video's detected
        # language only (we never want auto-translated captions — those distort
        # meaning, e.g. Vietnamese video with auto-English captions).
        if yt_lang is None and detected_lang and detected_lang in raw_auto:
            yt_lang = detected_lang

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
            # Detect video language up-front so STT can target it.
            meta = await get_youtube_metadata(video_id)
            detected_lang = (meta.get("language") or "en").split("-")[0].lower()
            # Deepgram supports common ISO 639-1 codes directly; map outliers if needed.
            deepgram_lang = detected_lang if detected_lang in {
                "en", "vi", "zh", "zh-CN", "ja", "ko", "es", "fr", "de", "pt",
                "ru", "it", "id", "th", "ar", "tr", "pl", "nl",
            } else "en"

            jobs[job_id].step = "video_download"
            video_path = await download_youtube_video(video_id)

            jobs[job_id].step = "audio_extraction"
            audio_path = await extract_audio_from_upload(video_path)

            jobs[job_id].step = "transcription"
            keys: TranscriptionKeys = {}
            segments = await stt_provider.transcribe(audio_path, keys, deepgram_lang)

            jobs[job_id].step = "indexing"
            result_dict: dict[str, Any] = {
                "status": "ready",
                "source": "stt",
                "lang": deepgram_lang,
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
