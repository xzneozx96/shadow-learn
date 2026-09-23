import hashlib
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.catalog.models import (
    CatalogTipCards,
    CatalogTipStudio,
    CatalogTipTranscript,
    CatalogTTS,
    CatalogWordBreakdown,
)
from app.db import SessionLocal
from app.media.models import MediaKind, MediaObject
from app.settings import settings

logger = logging.getLogger(__name__)

BREAKDOWN_LANG = "vi"


def tts_key(provider: str, voice: str | None, lang: str, text: str) -> str:
    return hashlib.sha256(f"{provider}|{voice or ''}|{lang}|{text}".encode()).hexdigest()


async def get_tts(s3, key: str) -> bytes | None:
    async with SessionLocal() as session:
        object_key = await session.scalar(
            select(MediaObject.object_key).join(CatalogTTS, CatalogTTS.media_id == MediaObject.id).where(
                CatalogTTS.key == key
            )
        )
    if object_key is None:
        return None
    obj = await s3.get_object(Bucket=settings.s3_bucket, Key=object_key)
    async with obj["Body"] as body:
        audio = await body.read()
    logger.info("catalog hit key=%s", key)
    return audio


async def put_tts(s3, key: str, audio: bytes) -> None:
    object_key = f"catalog/tts/{key}.mp3"
    await s3.put_object(Bucket=settings.s3_bucket, Key=object_key, Body=audio, ContentType="audio/mpeg")
    async with SessionLocal() as session:
        media_id = await session.scalar(
            insert(MediaObject)
            .values(
                kind=MediaKind.tts,
                object_key=object_key,
                size=len(audio),
                sha256=hashlib.sha256(audio).hexdigest(),
                content_type="audio/mpeg",
            )
            .on_conflict_do_nothing(index_elements=[MediaObject.object_key])
            .returning(MediaObject.id)
        )
        if media_id is not None:
            await session.execute(
                insert(CatalogTTS).values(key=key, media_id=media_id).on_conflict_do_nothing()
            )
        await session.commit()


async def _get(model, label: str, **key: str) -> dict[str, Any] | None:
    async with SessionLocal() as session:
        row = await session.get(model, key)
    if row is None:
        return None
    logger.info("catalog hit %s %s", label, " ".join(f"{k}={v}" for k, v in key.items()))
    return row.data


async def _put(model, data: dict[str, Any], **key: str) -> None:
    async with SessionLocal() as session:
        await session.execute(
            insert(model)
            .values(**key, data=data)
            .on_conflict_do_update(index_elements=list(key), set_={"data": data})
        )
        await session.commit()


async def get_word_breakdown(word: str) -> dict[str, Any] | None:
    return await _get(CatalogWordBreakdown, "breakdown", word=word, lang=BREAKDOWN_LANG)


async def put_word_breakdown(word: str, data: dict[str, Any]) -> None:
    await _put(CatalogWordBreakdown, data, word=word, lang=BREAKDOWN_LANG)


async def get_tip_transcript(video_id: str) -> dict[str, Any] | None:
    return await _get(CatalogTipTranscript, "tip-transcript", video_id=video_id)


async def put_tip_transcript(video_id: str, data: dict[str, Any]) -> None:
    await _put(CatalogTipTranscript, data, video_id=video_id)


async def get_tip_studio(video_id: str, kind: str, locale: str) -> dict[str, Any] | None:
    if kind == "cards":
        return await _get(CatalogTipCards, "tip-cards", video_id=video_id, locale=locale)
    return await _get(CatalogTipStudio, "tip-studio", video_id=video_id, kind=kind, locale=locale)


async def put_tip_studio(video_id: str, kind: str, locale: str, data: dict[str, Any]) -> None:
    if kind == "cards":
        await _put(CatalogTipCards, data, video_id=video_id, locale=locale)
    else:
        await _put(CatalogTipStudio, data, video_id=video_id, kind=kind, locale=locale)
