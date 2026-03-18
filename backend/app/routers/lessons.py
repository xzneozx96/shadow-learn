"""Lesson generation router — background job model."""

import asyncio
import logging
import time
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)

from fastapi import APIRouter, BackgroundTasks, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse

from app.config import settings
from app.jobs import Job, jobs
from app.models import LessonRequest
from app.services.audio import (
    download_youtube_video,
    extract_audio_from_upload,
    get_youtube_duration,
    probe_upload_duration,
)
from app.services.pinyin import generate_pinyin
from app.services.transcription_provider import STTProvider, TranscriptionKeys
from app.services.translation import translate_segments
from app.services.validation import ValidationError, validate_upload_file, validate_youtube_url
from app.services.vocabulary import extract_vocabulary

router = APIRouter(prefix="/api/lessons")

_TEMP_DIR = Path("/tmp/shadowlearn")
_CHUNK_SIZE = 1024 * 1024  # 1 MB


async def _shared_pipeline(
    job_id: str,
    segments: list[dict],
    translation_languages: list[str],
    api_key: str,
    title: str,
    source: str,
    source_url: str | None,
    duration: float,
    media_filename: str | None = None,
) -> None:
    """Background pipeline: pinyin → translate + vocab → assemble → mark job complete."""
    t_pipeline = time.monotonic()
    logger.info("[pipeline] shared_pipeline: start segments=%d source=%s", len(segments), source)

    jobs[job_id].step = "pinyin"
    t0 = time.monotonic()
    enriched_segments = []
    for seg in segments:
        seg_pinyin = generate_pinyin(seg["text"])
        enriched_segments.append({**seg, "romanization": seg_pinyin})
    logger.info("[pipeline] pinyin: done in %.1fs", time.monotonic() - t0)

    jobs[job_id].step = "translation"
    t0 = time.monotonic()
    translated_segments, vocab_map = await asyncio.gather(
        translate_segments(enriched_segments, translation_languages, api_key),
        extract_vocabulary(enriched_segments, api_key),
    )
    logger.info(
        "[pipeline] translation+vocabulary: done in %.1fs, %d segments, %d vocab entries",
        time.monotonic() - t0,
        len(translated_segments),
        len(vocab_map),
    )

    jobs[job_id].step = "assembling"

    lesson_segments = []
    for seg in translated_segments:
        lesson_segments.append({
            "id": str(seg["id"]),
            "start": seg["start"],
            "end": seg["end"],
            "text": seg["text"],
            "romanization": seg.get("romanization", ""),
            "translations": seg.get("translations", {}),
            "words": vocab_map.get(seg["id"]) or vocab_map.get(str(seg["id"])) or [],
            "wordTimings": seg.get("word_timings") or None,
        })

    result: dict = {
        "lesson": {
            "title": title,
            "source": source,
            "source_url": source_url,
            "duration": duration,
            "segments": lesson_segments,
            "translation_languages": translation_languages,
        }
    }
    if media_filename:
        result["video_url"] = f"/api/lessons/video/{media_filename}"

    jobs[job_id].status = "complete"
    jobs[job_id].step = "complete"
    jobs[job_id].result = result
    logger.info("[pipeline] shared_pipeline: complete in %.1fs total", time.monotonic() - t_pipeline)


async def _process_youtube_lesson(
    request: LessonRequest,
    video_id: str,
    job_id: str,
    stt_provider: STTProvider,
) -> None:
    """Background task: validate duration → download video → extract audio →
    transcribe → shared pipeline."""
    video_path: Path | None = None
    audio_path: Path | None = None
    try:
        jobs[job_id].step = "duration_check"
        duration = await get_youtube_duration(video_id)
        if duration > settings.max_video_duration_seconds:
            max_mins = settings.max_video_duration_seconds / 60
            jobs[job_id].status = "error"
            jobs[job_id].error = f"Video exceeds the {max_mins:.0f}-minute duration limit."
            return

        jobs[job_id].step = "video_download"
        video_path = await download_youtube_video(video_id)

        jobs[job_id].step = "audio_extraction"
        audio_path = await extract_audio_from_upload(video_path)

        jobs[job_id].step = "transcription"
        keys: TranscriptionKeys = {}
        if request.deepgram_api_key:
            keys["deepgram_api_key"] = request.deepgram_api_key
        if request.azure_speech_key:
            keys["azure_speech_key"] = request.azure_speech_key
        if request.azure_speech_region:
            keys["azure_speech_region"] = request.azure_speech_region
        segments = await stt_provider.transcribe(audio_path, keys, request.source_language)
        # Audio no longer needed after transcription
        audio_path.unlink(missing_ok=True)
        audio_path = None

        source_url = f"https://www.youtube.com/watch?v={video_id}"
        title = f"YouTube Video ({video_id})"

        await _shared_pipeline(
            job_id,
            segments,
            request.translation_languages,
            request.openrouter_api_key,
            title,
            "youtube",
            source_url,
            duration,
            media_filename=video_path.name if video_path else None,
        )

    except Exception as exc:
        logger.exception("YouTube lesson pipeline failed: %s", exc)
        jobs[job_id].status = "error"
        jobs[job_id].error = str(exc)
    finally:
        if audio_path and audio_path.exists():
            audio_path.unlink(missing_ok=True)
        # Delete video only on failure; on success the /video endpoint deletes it after streaming
        if video_path and video_path.exists() and jobs[job_id].status != "complete":
            video_path.unlink(missing_ok=True)


async def _process_upload_lesson(
    file: UploadFile,
    translation_languages: list[str],
    openrouter_api_key: str,
    job_id: str,
    deepgram_api_key: str | None = None,
    azure_speech_key: str | None = None,
    azure_speech_region: str | None = None,
    source_language: str = "zh-CN",
    stt_provider: STTProvider | None = None,
) -> None:
    """Background task: save file → probe duration → extract audio → transcribe → shared pipeline."""
    _TEMP_DIR.mkdir(parents=True, exist_ok=True)
    video_path: Path | None = None
    audio_path: Path | None = None
    try:
        filename = file.filename or "upload"
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "mp4"
        title = Path(filename).stem
        logger.info("[pipeline] upload_lesson: start file=%s", filename)

        jobs[job_id].step = "upload"
        t0 = time.monotonic()
        video_path = _TEMP_DIR / f"{uuid.uuid4()}.{ext}"
        total_bytes = 0
        with video_path.open("wb") as f:
            while True:
                chunk = await file.read(_CHUNK_SIZE)
                if not chunk:
                    break
                f.write(chunk)
                total_bytes += len(chunk)
        logger.info("[pipeline] upload: received %.1f MB in %.1fs", total_bytes / 1024 / 1024, time.monotonic() - t0)

        try:
            validate_upload_file(filename, total_bytes)
        except ValidationError as exc:
            jobs[job_id].status = "error"
            jobs[job_id].error = exc.message
            return

        jobs[job_id].step = "duration_check"
        duration = await probe_upload_duration(video_path)
        logger.info("[pipeline] duration_check: %.1fs", duration)
        if duration > settings.max_video_duration_seconds:
            max_mins = settings.max_video_duration_seconds / 60
            jobs[job_id].status = "error"
            jobs[job_id].error = f"Video exceeds the {max_mins:.0f}-minute duration limit."
            return

        jobs[job_id].step = "audio_extraction"
        t0 = time.monotonic()
        audio_path = await extract_audio_from_upload(video_path)
        logger.info("[pipeline] audio_extraction: done in %.1fs", time.monotonic() - t0)

        jobs[job_id].step = "transcription"
        t0 = time.monotonic()
        keys: TranscriptionKeys = {}
        if deepgram_api_key:
            keys["deepgram_api_key"] = deepgram_api_key
        if azure_speech_key:
            keys["azure_speech_key"] = azure_speech_key
        if azure_speech_region:
            keys["azure_speech_region"] = azure_speech_region
        if stt_provider is None:
            raise RuntimeError("No STT provider configured")
        segments = await stt_provider.transcribe(audio_path, keys, source_language)
        logger.info("[pipeline] transcription: done in %.1fs, %d segments", time.monotonic() - t0, len(segments))

        await _shared_pipeline(
            job_id,
            segments,
            translation_languages,
            openrouter_api_key,
            title,
            "upload",
            None,
            duration,
        )

    except Exception as exc:
        logger.exception("Upload lesson pipeline failed: %s", exc)
        jobs[job_id].status = "error"
        jobs[job_id].error = str(exc)
    finally:
        if video_path and video_path.exists():
            video_path.unlink(missing_ok=True)
        if audio_path and audio_path.exists():
            audio_path.unlink(missing_ok=True)


@router.post("/generate")
async def generate_lesson(request: LessonRequest, background_tasks: BackgroundTasks, req: Request) -> dict:
    """Accept a LessonRequest JSON body, start background pipeline, return job_id immediately."""
    if request.source == "youtube":
        if not request.youtube_url:
            raise HTTPException(status_code=400, detail="youtube_url is required for source 'youtube'")
        try:
            video_id = validate_youtube_url(request.youtube_url)
        except ValidationError as exc:
            raise HTTPException(status_code=400, detail=exc.message)

        stt_provider = req.app.state.stt_provider
        job_id = str(uuid.uuid4())
        jobs[job_id] = Job(status="processing", step="queued", result=None, error=None)
        background_tasks.add_task(_process_youtube_lesson, request, video_id, job_id, stt_provider)
        return {"job_id": job_id}
    else:
        raise HTTPException(
            status_code=400,
            detail="Use POST /api/lessons/generate-upload with multipart form for file uploads.",
        )


@router.post("/generate-upload")
async def generate_lesson_upload(
    background_tasks: BackgroundTasks,
    req: Request,
    file: UploadFile,
    translation_languages: str = Form(...),
    openrouter_api_key: str = Form(...),
    deepgram_api_key: str | None = Form(None),
    azure_speech_key: str | None = Form(None),
    azure_speech_region: str | None = Form(None),
    source_language: str = Form("zh-CN"),
) -> dict:
    """Accept a multipart upload, start background pipeline, return job_id immediately."""
    languages = [lang.strip() for lang in translation_languages.split(",") if lang.strip()]
    if not languages:
        raise HTTPException(status_code=400, detail="translation_languages must not be empty")

    stt_provider = req.app.state.stt_provider
    job_id = str(uuid.uuid4())
    jobs[job_id] = Job(status="processing", step="queued", result=None, error=None)
    background_tasks.add_task(
        _process_upload_lesson,
        file,
        languages,
        openrouter_api_key,
        job_id,
        deepgram_api_key,
        azure_speech_key,
        azure_speech_region,
        source_language,
        stt_provider,
    )
    return {"job_id": job_id}


@router.get("/video/{filename}")
async def get_video(filename: str) -> StreamingResponse:
    """Serve a temporary video file and delete it after sending."""
    safe_name = Path(filename).name
    video_path = _TEMP_DIR / safe_name

    if not video_path.exists() or not video_path.is_file():
        raise HTTPException(status_code=404, detail="Video file not found")

    def iterfile():
        with video_path.open("rb") as f:
            while chunk := f.read(1024 * 64):
                yield chunk
        video_path.unlink(missing_ok=True)

    _VIDEO_MEDIA_TYPES = {"mp4": "video/mp4", "mkv": "video/x-matroska", "webm": "video/webm"}
    ext = safe_name.rsplit(".", 1)[-1] if "." in safe_name else ""
    media_type = _VIDEO_MEDIA_TYPES.get(ext, "video/mp4")

    return StreamingResponse(
        iterfile(),
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}"',
            "Content-Length": str(video_path.stat().st_size),
        },
    )
