"""Lesson generation router — background job model."""

import asyncio
import logging
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Annotated, Any

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Form,
    Header,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.deps import CurrentUser
from app.accounts.models import User
from app.db import SessionLocal, get_session
from app.job_store import complete_job, fail_job, register_job, update_job
from app.keys.models import Provider
from app.keys.service import KeyResolver, NoProviderKey, ProviderKeys
from app.lessons.models import Lesson, LessonSegment
from app.lessons.services.audio import (
    download_youtube_video,
    ensure_temp_dir,
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
from app.media.models import MediaKind, MediaObject
from app.media.service import content_type_for, delete_objects, media_url, upload_file
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

Session = Annotated[AsyncSession, Depends(get_session)]

_CHUNK_SIZE = 1024 * 1024  # 1 MB


MediaUpload = asyncio.Task[MediaObject]


def _start_upload(s3, user_id: uuid.UUID, lesson_id: uuid.UUID, path: Path) -> MediaUpload:
    kind = MediaKind.video if content_type_for(path).startswith("video/") else MediaKind.audio
    return asyncio.create_task(upload_file(s3, user_id=user_id, kind=kind, lesson_id=lesson_id, source_path=path))


async def _discard_upload(s3, upload: MediaUpload | None) -> None:
    if upload is None:
        return
    upload.cancel()
    try:
        media = await upload
    except asyncio.CancelledError:
        return
    except Exception:
        logger.warning("[pipeline] media upload failed", exc_info=True)
        return
    async with SessionLocal() as session:
        if await session.get(MediaObject, media.id) is not None:
            return
    await delete_objects(s3, [media.object_key])


async def _save_lesson(
    *,
    lesson_id: uuid.UUID,
    user_id: uuid.UUID,
    title: str,
    source: str,
    source_url: str | None,
    duration: float,
    source_language: str,
    translation_languages: list[str],
    segments: list[dict],
    media_upload: MediaUpload | None,
) -> MediaObject | None:
    media = await media_upload if media_upload is not None else None
    async with SessionLocal() as session:
        session.add(
            Lesson(
                id=lesson_id,
                user_id=user_id,
                title=title,
                source=source,
                source_url=source_url,
                duration_s=duration,
                source_language=source_language,
                translation_languages=translation_languages,
            )
        )
        await session.flush()
        session.add_all(
            LessonSegment(lesson_id=lesson_id, position=i, data=seg, start_s=seg["start"], end_s=seg["end"])
            for i, seg in enumerate(segments)
        )
        if media is not None:
            session.add(media)
        await session.commit()
    return media


async def _shared_pipeline(
    job_id: str,
    segments: list[dict],
    translation_languages: list[str],
    api_key: str,
    title: str,
    source: str,
    source_url: str | None,
    duration: float,
    *,
    lesson_id: uuid.UUID,
    user_id: uuid.UUID,
    source_language: str = "zh-CN",
    media_upload: MediaUpload | None = None,
) -> None:
    t_pipeline = time.monotonic()
    logger.info("[pipeline] shared_pipeline: start segments=%d source=%s", len(segments), source)

    if source_language.startswith("zh"):
        await update_job(job_id, step="normalization")
        segments = [{**seg, "text": normalize_chinese(seg.get("text", ""))} for seg in segments]

    await update_job(job_id, step="romanization")
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

    await update_job(job_id, step="translation")
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

    await update_job(job_id, step="assembling")

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

    media = await _save_lesson(
        lesson_id=lesson_id,
        user_id=user_id,
        title=title,
        source=source,
        source_url=source_url,
        duration=duration,
        source_language=source_language,
        translation_languages=translation_languages,
        segments=lesson_segments,
        media_upload=media_upload,
    )

    result: dict = {
        "lesson": {
            "id": str(lesson_id),
            "title": title,
            "source": source,
            "source_url": source_url,
            "duration": duration,
            "segments": lesson_segments,
            "translation_languages": translation_languages,
        }
    }
    if media is not None:
        result[f"{media.kind}_url"] = media_url(media.id)

    await complete_job(job_id, result)
    logger.info("[pipeline] shared_pipeline: complete in %.1fs total", time.monotonic() - t_pipeline)


async def _process_youtube_lesson(
    request: LessonRequest,
    video_id: str,
    job_id: str,
    stt_provider: STTProvider,
    openrouter_key: str,
    stt_keys: TranscriptionKeys,
    user_id: uuid.UUID,
    s3,
) -> None:
    """Background task: validate duration → (manual subtitle OR STT) → shared pipeline."""
    lesson_id = uuid.uuid4()
    upload: MediaUpload | None = None
    video_path: Path | None = None
    audio_path: Path | None = None
    try:
        await update_job(job_id, step="duration_check")
        meta = await get_youtube_metadata(video_id)
        duration = meta["duration"]
        if duration > settings.max_video_duration_seconds:
            max_mins = settings.max_video_duration_seconds / 60
            err_msg = f"Video exceeds the {max_mins:.0f}-minute duration limit."
            logger.warning("[pipeline] %s: %s", job_id, err_msg)
            await fail_job(job_id, err_msg)
            return

        yt_lang = pick_manual_subtitle(meta["subtitles"], request.source_language)
        segments: list[dict] | None = None

        if yt_lang:
            await update_job(job_id, step="subtitle_download")
            try:
                vtt_task = asyncio.create_task(download_subtitle_vtt(video_id, yt_lang))
                video_task = asyncio.create_task(download_youtube_video(video_id))
                vtt_body, video_path = await asyncio.gather(vtt_task, video_task)
                upload = _start_upload(s3, user_id, lesson_id, video_path)
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
                if video_path is None:
                    try:
                        video_path = await video_task
                    except Exception:
                        logger.warning("[pipeline] youtube video download failed, retrying", exc_info=True)
                    else:
                        upload = _start_upload(s3, user_id, lesson_id, video_path)
        else:
            logger.info("[pipeline] youtube subtitle: no manual track, falling back to STT")

        if segments is None:
            if video_path is None:
                await update_job(job_id, step="video_download")
                video_path = await download_youtube_video(video_id)
                upload = _start_upload(s3, user_id, lesson_id, video_path)

            await update_job(job_id, step="audio_extraction")
            audio_path = await extract_audio_from_upload(video_path)

            await update_job(job_id, step="transcription")
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
            lesson_id=lesson_id,
            user_id=user_id,
            source_language=request.source_language,
            media_upload=upload,
        )

    except Exception as exc:
        await _discard_upload(s3, upload)
        error_str = str(exc)
        if "ffmpeg" in error_str.lower():
            error_str = "Media processing failed (FFmpeg error). The file might be corrupted or in an unsupported codec."
        
        logger.exception("[pipeline] YouTube lesson failed for job %s: %s", job_id, error_str)
        await fail_job(job_id, error_str)
    finally:
        if audio_path:
            audio_path.unlink(missing_ok=True)
        if video_path:
            video_path.unlink(missing_ok=True)


async def _process_upload_lesson(
    file: UploadFile,
    translation_languages: list[str],
    openrouter_key: str,
    job_id: str,
    stt_keys: TranscriptionKeys,
    user_id: uuid.UUID,
    s3,
    source_language: str = "zh-CN",
    stt_provider: STTProvider | None = None,
) -> None:
    """Background task: save file → probe duration → extract audio → transcribe → shared pipeline."""
    temp_dir = ensure_temp_dir()
    lesson_id = uuid.uuid4()
    upload: MediaUpload | None = None
    video_path: Path | None = None
    audio_path: Path | None = None
    try:
        filename = file.filename or "upload"
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "mp4"
        title = Path(filename).stem
        logger.info("[pipeline] upload_lesson: start file=%s", filename)

        await update_job(job_id, step="upload")
        t0 = time.monotonic()
        video_path = temp_dir / f"{uuid.uuid4()}.{ext}"
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
            await fail_job(job_id, exc.message)
            return

        await update_job(job_id, step="duration_check")
        duration = await probe_upload_duration(video_path)
        logger.info("[pipeline] duration_check: %.1fs", duration)
        if duration > settings.max_video_duration_seconds:
            max_mins = settings.max_video_duration_seconds / 60
            err_msg = f"Video exceeds the {max_mins:.0f}-minute duration limit."
            logger.warning("[pipeline] %s: %s", job_id, err_msg)
            await fail_job(job_id, err_msg)
            return

        upload = _start_upload(s3, user_id, lesson_id, video_path)
        await update_job(job_id, step="audio_extraction")
        t0 = time.monotonic()
        audio_path = await extract_audio_from_upload(video_path)
        logger.info("[pipeline] audio_extraction: done in %.1fs", time.monotonic() - t0)

        await update_job(job_id, step="transcription")
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
            lesson_id=lesson_id,
            user_id=user_id,
            source_language=source_language,
            media_upload=upload,
        )

    except Exception as exc:
        await _discard_upload(s3, upload)
        error_str = str(exc)
        if "ffmpeg" in error_str.lower():
            error_str = "Media processing failed (FFmpeg error). The file might be corrupted or in an unsupported codec."
        
        logger.exception("[pipeline] Upload lesson failed for job %s: %s", job_id, error_str)
        await fail_job(job_id, error_str)
    finally:
        if video_path:
            video_path.unlink(missing_ok=True)
        if audio_path:
            audio_path.unlink(missing_ok=True)


async def _process_blog_lesson(
    request: LessonRequest,
    job_id: str,
    tts_provider: TTSProvider,
    stt_provider: STTProvider,
    openrouter_key: str,
    tts_keys: TTSKeys,
    stt_keys: TranscriptionKeys,
    user_id: uuid.UUID,
    s3,
) -> None:
    """Background task: (scrape URL or use pasted text) → TTS audio → Gladia transcription → shared pipeline."""
    lesson_id = uuid.uuid4()
    upload: MediaUpload | None = None
    audio_path: Path | None = None
    try:
        if request.blog_text:
            title = request.blog_title or "Untitled"
            text = request.blog_text
            logger.info("[pipeline] blog_lesson: using pasted text, %d chars, title=%r", len(text), title)
        else:
            await update_job(job_id, step="scraping")
            title, text = await scrape_article(request.blog_url, settings.max_article_chars)
            logger.info("[pipeline] blog_lesson: scraped %d chars, title=%r", len(text), title)

        await update_job(job_id, step="tts")
        # TTS providers accept "zh" not "zh-CN" — strip the region suffix
        tts_lang = request.source_language.split("-")[0]
        audio_bytes = await tts_provider.synthesize(
            text, tts_keys, tts_lang,
            voice_id=request.minimax_voice_id,
        )
        if not audio_bytes:
            raise ValueError("TTS synthesis returned empty audio.")

        audio_path = ensure_temp_dir() / f"{uuid.uuid4()}.mp3"
        audio_path.write_bytes(audio_bytes)
        upload = _start_upload(s3, user_id, lesson_id, audio_path)
        logger.info("[pipeline] blog_lesson: TTS audio written to %s (%.1f KB)", audio_path.name, len(audio_bytes) / 1024)

        await update_job(job_id, step="transcription")
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
            lesson_id=lesson_id,
            user_id=user_id,
            source_language=request.source_language,
            media_upload=upload,
        )

    except Exception as exc:
        await _discard_upload(s3, upload)
        logger.exception("[pipeline] Blog lesson failed for job %s", job_id)
        await fail_job(job_id, str(exc))
    finally:
        if audio_path:
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
        job_id = await register_job(id_prefix="lesson", user_id=user.id)
        background_tasks.add_task(
            _process_youtube_lesson,
            request,
            video_id,
            job_id,
            stt_provider,
            openrouter_key,
            stt_keys,
            user.id,
            req.app.state.s3,
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
        job_id = await register_job(id_prefix="lesson", user_id=user.id)
        background_tasks.add_task(
            _process_blog_lesson,
            request,
            job_id,
            tts_provider,
            stt_provider,
            openrouter_key,
            tts_keys,
            stt_keys,
            user.id,
            req.app.state.s3,
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
    job_id = await register_job(id_prefix="lesson", user_id=user.id)
    background_tasks.add_task(
        _process_upload_lesson,
        form.file,
        languages,
        openrouter_key,
        job_id,
        stt_keys,
        user.id,
        req.app.state.s3,
        form.source_language,
        stt_provider,
    )
    return {"job_id": job_id}


async def owned_lesson(session: AsyncSession, lesson_id: uuid.UUID, user: User) -> Lesson:
    lesson = await session.get(Lesson, lesson_id)
    if lesson is None or lesson.user_id != user.id:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return lesson


def _summary(lesson: Lesson, segment_count: int) -> dict[str, Any]:
    return {
        "id": str(lesson.id),
        "title": lesson.title,
        "source": lesson.source,
        "source_url": lesson.source_url,
        "duration": lesson.duration_s,
        "source_language": lesson.source_language,
        "translation_languages": lesson.translation_languages,
        "created_at": lesson.created_at.isoformat(),
        "last_opened_at": lesson.last_opened_at.isoformat() if lesson.last_opened_at else None,
        "segment_count": segment_count,
        "meta": lesson.meta,
        "version": lesson.version,
    }


async def _segment_count(session: AsyncSession, lesson_id: uuid.UUID) -> int:
    return await session.scalar(select(func.count()).where(LessonSegment.lesson_id == lesson_id))


@router.get("")
async def list_lessons(session: Session, user: CurrentUser) -> list[dict[str, Any]]:
    counts = (
        select(LessonSegment.lesson_id, func.count().label("n")).group_by(LessonSegment.lesson_id).subquery()
    )
    rows = await session.execute(
        select(Lesson, func.coalesce(counts.c.n, 0))
        .outerjoin(counts, counts.c.lesson_id == Lesson.id)
        .where(Lesson.user_id == user.id)
        .order_by(Lesson.created_at.desc())
    )
    media = await session.execute(
        select(MediaObject.lesson_id, MediaObject.kind, MediaObject.id)
        .join(Lesson, Lesson.id == MediaObject.lesson_id)
        .where(Lesson.user_id == user.id, MediaObject.kind.in_([MediaKind.video, MediaKind.audio]))
    )
    urls: dict[uuid.UUID, dict[str, str]] = {}
    for lesson_id, kind, media_id in media:
        urls.setdefault(lesson_id, {})[f"{kind}_url"] = media_url(media_id)
    return [{**_summary(lesson, n), **urls.get(lesson.id, {})} for lesson, n in rows]


def _etag(version: int) -> str:
    return f'"{version}"'


@router.get("/{lesson_id}")
async def get_lesson(lesson_id: uuid.UUID, session: Session, user: CurrentUser, response: Response) -> dict[str, Any]:
    """Return the lesson, its segments in order, and media URLs with fresh tickets."""
    lesson = await owned_lesson(session, lesson_id, user)
    response.headers["ETag"] = _etag(lesson.version)
    segments = (
        await session.scalars(
            select(LessonSegment.data).where(LessonSegment.lesson_id == lesson_id).order_by(LessonSegment.position)
        )
    ).all()
    body = {**_summary(lesson, len(segments)), "segments": segments}
    media = await session.scalars(
        select(MediaObject).where(
            MediaObject.lesson_id == lesson_id, MediaObject.kind.in_([MediaKind.video, MediaKind.audio])
        )
    )
    for item in media:
        body[f"{item.kind}_url"] = media_url(item.id)
    return body


class LessonPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)] = ""
    meta: dict[str, Any] = Field(default_factory=dict)
    last_opened_at: datetime | None = None


@router.patch("/{lesson_id}", response_model=None)
async def patch_lesson(
    lesson_id: uuid.UUID,
    body: LessonPatch,
    session: Session,
    user: CurrentUser,
    response: Response,
    if_match: Annotated[str | None, Header()] = None,
) -> dict[str, Any] | JSONResponse:
    """Rename the lesson, replace the client-owned ``meta`` exactly as sent, and set ``last_opened_at``.

    With ``If-Match``, the write applies only at that version; otherwise it answers 409 with the current lesson.
    Every write bumps the version.
    """
    lesson = await owned_lesson(session, lesson_id, user)
    where = [Lesson.id == lesson_id]
    if if_match is not None:
        where.append(Lesson.version == _expected_version(if_match))
    version = await session.scalar(
        update(Lesson)
        .where(*where)
        .values(**{field: getattr(body, field) for field in body.model_fields_set}, version=Lesson.version + 1)
        .returning(Lesson.version)
        .execution_options(synchronize_session=False)
    )
    if version is None:
        await session.rollback()
        await session.refresh(lesson)
        return JSONResponse(
            status_code=409,
            content={"detail": "version conflict", "record": _summary(lesson, await _segment_count(session, lesson_id))},
            headers={"ETag": _etag(lesson.version)},
        )
    await session.commit()
    await session.refresh(lesson)
    response.headers["ETag"] = _etag(version)
    return _summary(lesson, await _segment_count(session, lesson_id))


def _expected_version(if_match: str) -> int:
    try:
        return int(if_match.removeprefix("W/").strip('"'))
    except ValueError as e:
        raise HTTPException(status_code=422, detail="bad If-Match version") from e


@router.delete("/{lesson_id}", status_code=204)
async def delete_lesson(lesson_id: uuid.UUID, request: Request, session: Session, user: CurrentUser) -> Response:
    """Delete the lesson, its segments, its media rows, and their MinIO objects."""
    lesson = await owned_lesson(session, lesson_id, user)
    keys = (await session.scalars(select(MediaObject.object_key).where(MediaObject.lesson_id == lesson_id))).all()
    await session.delete(lesson)
    await session.commit()
    await delete_objects(request.app.state.s3, list(keys))
    return Response(status_code=204)
