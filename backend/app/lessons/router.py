"""Lesson generation router — background job model."""

import asyncio
import logging
import time
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict

from app.accounts.deps import CurrentUser
from app.job_store import jobs, register_job
from app.keys.models import Provider
from app.keys.service import KeyResolver, NoProviderKey, ProviderKeys
from app.lessons.services.audio import (
    download_youtube_video,
    extract_audio_from_upload,
    get_youtube_metadata,
    probe_upload_duration,
)
from app.lessons.services.blog_scraper import scrape_article
from app.lessons.services.chinese_normalizer import normalize_chinese
from app.lessons.services.romanization_provider import get_romanization_provider
from app.lessons.services.segmentation_provider import get_segmentation_provider
from app.lessons.services.validation import (
    ValidationError,
    validate_upload_file,
    validate_youtube_url,
)
from app.lessons.services.vocabulary import enrich_vocabulary, extract_vocabulary
from app.lessons.services.youtube_subtitles import (
    download_subtitle_vtt,
    parse_vtt_to_segments,
    pick_manual_subtitle,
)
from app.models import LessonRequest
from app.settings import settings
from app.shared.language_config import get_language_config
from app.transcription.services.transcription_provider import (
    STTProvider,
    TranscriptionKeys,
)
from app.translation.services.translation import translate_segments
from app.tts.services.tts_provider import TTSKeys, TTSProvider

logger = logging.getLogger(__name__)

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
    source_language: str = "zh-CN",
    media_filename: str | None = None,
) -> None:
    """Background pipeline: romanization → translate + vocab → assemble → mark job complete."""
    t_pipeline = time.monotonic()
    logger.info("[pipeline] shared_pipeline: start segments=%d source=%s", len(segments), source)

    if source_language.startswith("zh"):
        jobs[job_id].step = "normalization"
        segments = [{**seg, "text": normalize_chinese(seg.get("text", ""))} for seg in segments]

    jobs[job_id].step = "romanization"
    t0 = time.monotonic()
    romanizer = get_romanization_provider(source_language)
    enriched_segments = []
    for seg in segments:
        enriched_segments.append({**seg, "romanization": romanizer.romanize_text(seg["text"])})
    logger.info("[pipeline] romanization: done in %.1fs (source_language=%s)", time.monotonic() - t0, source_language)

    meaning_language = get_language_config(translation_languages[0])["language_name"]
    segmenter = get_segmentation_provider(source_language)
    if segmenter is not None:
        for seg in enriched_segments:
            seg["tokens"] = segmenter.segment(seg["text"])
        vocab_coro = enrich_vocabulary(
            enriched_segments, romanizer, api_key,
            source_language=source_language, meaning_language=meaning_language,
        )
    else:
        vocab_coro = extract_vocabulary(
            enriched_segments, api_key,
            source_language=source_language, meaning_language=meaning_language,
        )

    jobs[job_id].step = "translation"
    t0 = time.monotonic()
    translated_segments, vocab_map = await asyncio.gather(
        translate_segments(
            enriched_segments, translation_languages, api_key,
            source_language=source_language,
        ),
        vocab_coro,
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
        if source == "blog":
            result["audio_url"] = f"/api/lessons/audio/{media_filename}"
        else:
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
    openrouter_key: str,
    stt_keys: TranscriptionKeys,
) -> None:
    """Background task: validate duration → (manual subtitle OR STT) → shared pipeline."""
    video_path: Path | None = None
    audio_path: Path | None = None
    try:
        jobs[job_id].step = "duration_check"
        meta = await get_youtube_metadata(video_id)
        duration = meta["duration"]
        if duration > settings.max_video_duration_seconds:
            max_mins = settings.max_video_duration_seconds / 60
            err_msg = f"Video exceeds the {max_mins:.0f}-minute duration limit."
            logger.warning("[pipeline] %s: %s", job_id, err_msg)
            jobs[job_id].status = "error"
            jobs[job_id].error = err_msg
            return

        yt_lang = pick_manual_subtitle(meta["subtitles"], request.source_language)
        segments: list[dict] | None = None

        if yt_lang:
            jobs[job_id].step = "subtitle_download"
            try:
                vtt_task = asyncio.create_task(download_subtitle_vtt(video_id, yt_lang))
                video_task = asyncio.create_task(download_youtube_video(video_id))
                vtt_body, video_path = await asyncio.gather(vtt_task, video_task)
                segments = parse_vtt_to_segments(vtt_body, request.source_language)
                if not segments:
                    logger.warning(
                        "[pipeline] youtube subtitle: parse yielded no segments, falling back to STT"
                    )
                    segments = None
                else:
                    logger.info(
                        "[pipeline] youtube subtitle: using manual track lang=%s, %d cues",
                        yt_lang, len(segments),
                    )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "[pipeline] youtube subtitle: download/parse failed (%s), falling back to STT",
                    exc,
                )
                segments = None
        else:
            logger.info("[pipeline] youtube subtitle: no manual track, falling back to STT")

        if segments is None:
            if video_path is None:
                jobs[job_id].step = "video_download"
                video_path = await download_youtube_video(video_id)

            jobs[job_id].step = "audio_extraction"
            audio_path = await extract_audio_from_upload(video_path)

            jobs[job_id].step = "transcription"
            segments = await stt_provider.transcribe(audio_path, stt_keys, request.source_language)
            if not segments:
                raise ValueError("No speech detected in the video. Please try a different video.")
            audio_path.unlink(missing_ok=True)
            audio_path = None

        source_url = f"https://www.youtube.com/watch?v={video_id}"
        title = f"YouTube Video ({video_id})"

        await _shared_pipeline(
            job_id,
            segments,
            request.translation_languages,
            openrouter_key,
            title,
            "youtube",
            source_url,
            duration,
            source_language=request.source_language,
            media_filename=video_path.name if video_path else None,
        )

    except Exception as exc:
        error_str = str(exc)
        if "ffmpeg" in error_str.lower():
            error_str = "Media processing failed (FFmpeg error). The file might be corrupted or in an unsupported codec."
        
        logger.exception("[pipeline] YouTube lesson failed for job %s: %s", job_id, error_str)
        jobs[job_id].status = "error"
        jobs[job_id].error = error_str
    finally:
        if audio_path and audio_path.exists():
            audio_path.unlink(missing_ok=True)
        # Delete video only on failure; on success the /video endpoint deletes it after streaming
        if video_path and video_path.exists() and jobs[job_id].status != "complete":
            video_path.unlink(missing_ok=True)


async def _process_upload_lesson(
    file: UploadFile,
    translation_languages: list[str],
    openrouter_key: str,
    job_id: str,
    stt_keys: TranscriptionKeys,
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
            logger.warning("[pipeline] %s: validation failed: %s", job_id, exc.message)
            jobs[job_id].status = "error"
            jobs[job_id].error = exc.message
            return

        jobs[job_id].step = "duration_check"
        duration = await probe_upload_duration(video_path)
        logger.info("[pipeline] duration_check: %.1fs", duration)
        if duration > settings.max_video_duration_seconds:
            max_mins = settings.max_video_duration_seconds / 60
            err_msg = f"Video exceeds the {max_mins:.0f}-minute duration limit."
            logger.warning("[pipeline] %s: %s", job_id, err_msg)
            jobs[job_id].status = "error"
            jobs[job_id].error = err_msg
            return

        jobs[job_id].step = "audio_extraction"
        t0 = time.monotonic()
        audio_path = await extract_audio_from_upload(video_path)
        logger.info("[pipeline] audio_extraction: done in %.1fs", time.monotonic() - t0)

        jobs[job_id].step = "transcription"
        t0 = time.monotonic()
        if stt_provider is None:
            raise RuntimeError("No STT provider configured")
        segments = await stt_provider.transcribe(audio_path, stt_keys, source_language)
        if not segments:
            raise ValueError("No speech detected in the media file. Please try a different file.")
        logger.info("[pipeline] transcription: done in %.1fs, %d segments", time.monotonic() - t0, len(segments))

        await _shared_pipeline(
            job_id,
            segments,
            translation_languages,
            openrouter_key,
            title,
            "upload",
            None,
            duration,
            source_language=source_language,
        )

    except Exception as exc:
        error_str = str(exc)
        if "ffmpeg" in error_str.lower():
            error_str = "Media processing failed (FFmpeg error). The file might be corrupted or in an unsupported codec."
        
        logger.exception("[pipeline] Upload lesson failed for job %s: %s", job_id, error_str)
        jobs[job_id].status = "error"
        jobs[job_id].error = error_str
    finally:
        if video_path and video_path.exists():
            video_path.unlink(missing_ok=True)
        if audio_path and audio_path.exists():
            audio_path.unlink(missing_ok=True)


async def _process_blog_lesson(
    request: LessonRequest,
    job_id: str,
    tts_provider: TTSProvider,
    stt_provider: STTProvider,
    openrouter_key: str,
    tts_keys: TTSKeys,
    stt_keys: TranscriptionKeys,
) -> None:
    """Background task: (scrape URL or use pasted text) → TTS audio → Gladia transcription → shared pipeline."""
    audio_path: Path | None = None
    try:
        if request.blog_text:
            title = request.blog_title or "Untitled"
            text = request.blog_text
            logger.info("[pipeline] blog_lesson: using pasted text, %d chars, title=%r", len(text), title)
        else:
            jobs[job_id].step = "scraping"
            title, text = await scrape_article(request.blog_url, settings.max_article_chars)
            logger.info("[pipeline] blog_lesson: scraped %d chars, title=%r", len(text), title)

        jobs[job_id].step = "tts"
        # TTS providers accept "zh" not "zh-CN" — strip the region suffix
        tts_lang = request.source_language.split("-")[0]
        audio_bytes = await tts_provider.synthesize(
            text, tts_keys, tts_lang,
            voice_id=request.minimax_voice_id,
        )
        if not audio_bytes:
            raise ValueError("TTS synthesis returned empty audio.")

        _TEMP_DIR.mkdir(parents=True, exist_ok=True)
        audio_path = _TEMP_DIR / f"{uuid.uuid4()}.mp3"
        audio_path.write_bytes(audio_bytes)
        logger.info("[pipeline] blog_lesson: TTS audio written to %s (%.1f KB)", audio_path.name, len(audio_bytes) / 1024)

        jobs[job_id].step = "transcription"
        segments = await stt_provider.transcribe(audio_path, stt_keys, request.source_language)
        if not segments:
            raise ValueError("No speech detected in synthesized audio.")
        logger.info("[pipeline] blog_lesson: %d segments from Gladia", len(segments))

        duration = segments[-1]["end"]
        await _shared_pipeline(
            job_id,
            segments,
            request.translation_languages,
            openrouter_key,
            title,
            "blog",
            request.blog_url or None,
            duration,
            source_language=request.source_language,
            media_filename=audio_path.name,
        )

    except Exception as exc:
        logger.exception("[pipeline] Blog lesson failed for job %s", job_id)
        jobs[job_id].status = "error"
        jobs[job_id].error = str(exc)
        if audio_path and audio_path.exists():
            audio_path.unlink(missing_ok=True)


async def _azure_keys(keys: KeyResolver, provider_name: str, *, required: bool = True) -> TranscriptionKeys:
    if provider_name != "azure":
        return {}
    try:
        azure = await keys(Provider.azure_speech)
    except NoProviderKey:
        if required:
            raise
        return {}
    return {"azure_speech_key": azure.value, "azure_speech_region": azure.region}


@router.post("/generate")
async def generate_lesson(
    request: LessonRequest,
    background_tasks: BackgroundTasks,
    req: Request,
    user: CurrentUser,
    keys: ProviderKeys,
) -> dict:
    """Accept a LessonRequest JSON body, start background pipeline, return job_id immediately."""
    if request.source == "youtube":
        if not request.youtube_url:
            raise HTTPException(status_code=400, detail="youtube_url is required for source 'youtube'")
        try:
            video_id = validate_youtube_url(request.youtube_url)
        except ValidationError as exc:
            raise HTTPException(status_code=400, detail=exc.message)

        openrouter_key = (await keys(Provider.openrouter)).value
        stt_keys = await _azure_keys(keys, req.app.state.stt_provider_name, required=False)
        stt_provider = req.app.state.stt_provider
        job_id = register_job(id_prefix="lesson", user_id=str(user.id))
        background_tasks.add_task(
            _process_youtube_lesson, request, video_id, job_id, stt_provider, openrouter_key, stt_keys
        )
        return {"job_id": job_id}
    elif request.source == "blog":
        if not request.blog_url and not request.blog_text:
            raise HTTPException(status_code=400, detail="blog_url or blog_text is required for source 'blog'")
        openrouter_key = (await keys(Provider.openrouter)).value
        tts_keys: TTSKeys = {**await _azure_keys(keys, req.app.state.tts_provider_name)}
        if settings.minimax_api_key:
            tts_keys["minimax_api_key"] = settings.minimax_api_key
        stt_keys = await _azure_keys(keys, req.app.state.stt_provider_name)
        tts_provider = req.app.state.tts_provider
        stt_provider = req.app.state.stt_provider
        job_id = register_job(id_prefix="lesson", user_id=str(user.id))
        background_tasks.add_task(
            _process_blog_lesson, request, job_id, tts_provider, stt_provider, openrouter_key, tts_keys, stt_keys
        )
        return {"job_id": job_id}
    else:
        raise HTTPException(
            status_code=400,
            detail="Use POST /api/lessons/generate-upload with multipart form for file uploads.",
        )


class UploadLessonForm(BaseModel):
    model_config = ConfigDict(extra="forbid")

    file: UploadFile
    translation_languages: str
    source_language: str = "zh-CN"


@router.post("/generate-upload")
async def generate_lesson_upload(
    background_tasks: BackgroundTasks,
    req: Request,
    form: Annotated[UploadLessonForm, Form()],
    user: CurrentUser,
    keys: ProviderKeys,
) -> dict:
    """Accept a multipart upload, start background pipeline, return job_id immediately."""
    languages = [lang.strip() for lang in form.translation_languages.split(",") if lang.strip()]
    if not languages:
        raise HTTPException(status_code=400, detail="translation_languages must not be empty")

    openrouter_key = (await keys(Provider.openrouter)).value
    stt_keys = await _azure_keys(keys, req.app.state.stt_provider_name)
    stt_provider = req.app.state.stt_provider
    job_id = register_job(id_prefix="lesson", user_id=str(user.id))
    background_tasks.add_task(
        _process_upload_lesson,
        form.file,
        languages,
        openrouter_key,
        job_id,
        stt_keys,
        form.source_language,
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


@router.get("/audio/{filename}")
async def get_audio(filename: str) -> StreamingResponse:
    """Serve a temporary TTS audio file and delete it after sending."""
    safe_name = Path(filename).name
    audio_path = _TEMP_DIR / safe_name

    if not audio_path.exists() or not audio_path.is_file():
        raise HTTPException(status_code=404, detail="Audio file not found")

    def iterfile():
        with audio_path.open("rb") as f:
            while chunk := f.read(1024 * 64):
                yield chunk
        audio_path.unlink(missing_ok=True)

    return StreamingResponse(
        iterfile(),
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}"',
            "Content-Length": str(audio_path.stat().st_size),
        },
    )
