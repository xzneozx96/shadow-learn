"""Lesson generation router with SSE streaming progress events."""

import json
import uuid
from pathlib import Path
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse

from app.config import settings
from app.models import LessonRequest
from app.services.audio import (
    extract_audio_from_upload,
    extract_audio_from_youtube,
    get_youtube_duration,
    probe_upload_duration,
)
from app.services.pinyin import generate_pinyin
from app.services.transcription import transcribe_audio
from app.services.translation import translate_segments
from app.services.validation import ValidationError, validate_upload_file, validate_youtube_url

router = APIRouter(prefix="/api/lessons")

_TEMP_DIR = Path("/tmp/shadowlearn")
_CHUNK_SIZE = 1024 * 1024  # 1 MB


def _sse_event(event: str, data: dict) -> str:
    """Format a single SSE event string."""
    payload = json.dumps(data)
    return f"event: {event}\ndata: {payload}\n\n"


async def _shared_pipeline(
    segments: list[dict],
    translation_languages: list[str],
    api_key: str,
    model: str,
    title: str,
    source: str,
    source_url: str | None,
    duration: float,
) -> AsyncGenerator[str, None]:
    """SSE generator: pinyin → translate → assemble → yield complete."""
    yield _sse_event("progress", {"step": "pinyin", "message": "Generating pinyin..."})

    enriched_segments = []
    for seg in segments:
        seg_pinyin = generate_pinyin(seg["text"])
        enriched_segments.append({**seg, "pinyin": seg_pinyin})

    yield _sse_event("progress", {"step": "translation", "message": "Translating segments..."})

    translated_segments = await translate_segments(
        enriched_segments,
        translation_languages,
        api_key,
        model,
    )

    yield _sse_event("progress", {"step": "assembling", "message": "Assembling lesson..."})

    lesson_segments = []
    for seg in translated_segments:
        lesson_segments.append({
            "id": str(seg["id"]),
            "start": seg["start"],
            "end": seg["end"],
            "chinese": seg["text"],
            "pinyin": seg.get("pinyin", ""),
            "translations": seg.get("translations", {}),
            "words": [],
        })

    lesson = {
        "title": title,
        "source": source,
        "source_url": source_url,
        "duration": duration,
        "segments": lesson_segments,
        "translation_languages": translation_languages,
    }

    yield _sse_event("complete", {"lesson": lesson})


async def _process_youtube_lesson(
    request: LessonRequest,
    video_id: str,
) -> AsyncGenerator[str, None]:
    """SSE generator for YouTube lesson: validate duration → extract audio → shared pipeline."""
    audio_path: Path | None = None
    try:
        yield _sse_event("progress", {"step": "duration_check", "message": "Checking video duration..."})

        duration = await get_youtube_duration(video_id)
        if duration > settings.max_video_duration_seconds:
            max_hours = settings.max_video_duration_seconds / 3600
            yield _sse_event("error", {
                "message": f"Video exceeds the {max_hours:.0f}-hour duration limit."
            })
            return

        yield _sse_event("progress", {"step": "audio_extraction", "message": "Downloading audio..."})
        audio_path = await extract_audio_from_youtube(video_id)

        yield _sse_event("progress", {"step": "transcription", "message": "Transcribing audio..."})
        segments = await transcribe_audio(audio_path, request.elevenlabs_api_key)

        source_url = f"https://www.youtube.com/watch?v={video_id}"
        title = f"YouTube Video ({video_id})"

        async for event in _shared_pipeline(
            segments,
            request.translation_languages,
            request.openrouter_api_key,
            request.openrouter_model,
            title,
            "youtube",
            source_url,
            duration,
        ):
            yield event

    except Exception as exc:
        yield _sse_event("error", {"message": str(exc)})
    finally:
        if audio_path and audio_path.exists():
            audio_path.unlink(missing_ok=True)


async def _process_upload_lesson(
    file: UploadFile,
    translation_languages: list[str],
    openrouter_api_key: str,
    openrouter_model: str,
    elevenlabs_api_key: str,
) -> AsyncGenerator[str, None]:
    """SSE generator for upload lesson: save file → probe duration → extract audio → shared pipeline."""
    _TEMP_DIR.mkdir(parents=True, exist_ok=True)
    video_path: Path | None = None
    audio_path: Path | None = None
    try:
        filename = file.filename or "upload"
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "mp4"

        yield _sse_event("progress", {"step": "upload", "message": "Receiving file..."})

        video_path = _TEMP_DIR / f"{uuid.uuid4()}.{ext}"
        total_bytes = 0
        with video_path.open("wb") as f:
            while True:
                chunk = await file.read(_CHUNK_SIZE)
                if not chunk:
                    break
                f.write(chunk)
                total_bytes += len(chunk)

        try:
            validate_upload_file(filename, total_bytes)
        except ValidationError as exc:
            yield _sse_event("error", {"message": exc.message})
            return

        yield _sse_event("progress", {"step": "duration_check", "message": "Probing duration..."})

        duration = await probe_upload_duration(video_path)
        if duration > settings.max_video_duration_seconds:
            max_hours = settings.max_video_duration_seconds / 3600
            yield _sse_event("error", {
                "message": f"Video exceeds the {max_hours:.0f}-hour duration limit."
            })
            return

        yield _sse_event("progress", {"step": "audio_extraction", "message": "Extracting audio..."})
        audio_path = await extract_audio_from_upload(video_path)

        yield _sse_event("progress", {"step": "transcription", "message": "Transcribing audio..."})
        segments = await transcribe_audio(audio_path, elevenlabs_api_key)

        async for event in _shared_pipeline(
            segments,
            translation_languages,
            openrouter_api_key,
            openrouter_model,
            filename,
            "upload",
            None,
            duration,
        ):
            yield event

    except Exception as exc:
        yield _sse_event("error", {"message": str(exc)})
    finally:
        if video_path and video_path.exists():
            video_path.unlink(missing_ok=True)
        if audio_path and audio_path.exists():
            audio_path.unlink(missing_ok=True)


@router.post("/generate")
async def generate_lesson(request: LessonRequest) -> StreamingResponse:
    """Accept a LessonRequest JSON body and stream SSE progress events."""
    if request.source == "youtube":
        if not request.youtube_url:
            raise HTTPException(status_code=400, detail="youtube_url is required for source 'youtube'")
        try:
            video_id = validate_youtube_url(request.youtube_url)
        except ValidationError as exc:
            raise HTTPException(status_code=400, detail=exc.message)

        generator = _process_youtube_lesson(request, video_id)
    else:
        # source == "upload" — this endpoint is for JSON body only; uploads use /generate-upload
        raise HTTPException(
            status_code=400,
            detail="Use POST /api/lessons/generate-upload with multipart form for file uploads.",
        )

    return StreamingResponse(generator, media_type="text/event-stream")


@router.post("/generate-upload")
async def generate_lesson_upload(
    file: UploadFile,
    translation_languages: str,
    openrouter_api_key: str,
    openrouter_model: str,
    elevenlabs_api_key: str,
) -> StreamingResponse:
    """Accept a multipart form upload and stream SSE progress events."""
    languages = [lang.strip() for lang in translation_languages.split(",") if lang.strip()]
    if not languages:
        raise HTTPException(status_code=400, detail="translation_languages must not be empty")

    generator = _process_upload_lesson(
        file,
        languages,
        openrouter_api_key,
        openrouter_model,
        elevenlabs_api_key,
    )

    return StreamingResponse(generator, media_type="text/event-stream")
