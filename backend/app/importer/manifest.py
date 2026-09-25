import uuid
from collections.abc import Iterable
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy import ARRAY, Text, Uuid, any_, bindparam, literal, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.types import TypeEngine

from app.importer.canonical import store_hash
from app.importer.models import QuarantinedRecord
from app.lessons.models import Lesson, LessonSegment
from app.media.models import MediaKind, MediaObject
from app.settings import settings
from app.userdata.models import TABLES

LESSONS = "lessons"
SEGMENTS = "segments"
RECORD_STORES = frozenset({LESSONS, SEGMENTS, *TABLES})

Record = tuple[str, Any]


class ImportKind(StrEnum):
    video = MediaKind.video.value
    audio = MediaKind.audio.value
    shadowing = MediaKind.shadowing.value


class Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class MediaKey(Camel):
    lesson_id: uuid.UUID
    kind: ImportKind
    segment_id: str | None = None


class QuarantineKey(Camel):
    store: str
    record_id: str


class Digest(BaseModel):
    count: int
    sha256: str


class MediaDigest(MediaKey):
    size: int
    sha256: str


def iso_ms(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def lesson_record(lesson: Lesson) -> dict[str, Any]:
    return {
        "id": str(lesson.id),
        "title": lesson.title,
        "source": lesson.source,
        "sourceUrl": lesson.source_url,
        "duration": lesson.duration_s,
        "sourceLanguage": lesson.source_language,
        "translationLanguages": lesson.translation_languages,
        "createdAt": iso_ms(lesson.created_at),
        "lastOpenedAt": iso_ms(lesson.last_opened_at) if lesson.last_opened_at else None,
        "meta": lesson.meta,
    }


def _lesson_ids(ids: Iterable[str]) -> list[uuid.UUID]:
    parsed = []
    for record_id in ids:
        try:
            parsed.append(uuid.UUID(record_id))
        except ValueError:
            continue
    return parsed


def _any(values: list[Any], item_type: TypeEngine[Any]) -> Any:
    """One array parameter, so a store of any size stays under asyncpg's 32767 bind limit."""
    return any_(bindparam("ids", values, type_=ARRAY(item_type)))


async def stored_records(session: AsyncSession, user_id: uuid.UUID, store: str, ids: list[str]) -> list[Record]:
    if store in (LESSONS, SEGMENTS):
        lesson_ids = _any(_lesson_ids(ids), Uuid())
        lessons = (await session.scalars(select(Lesson).where(Lesson.user_id == user_id, Lesson.id == lesson_ids))).all()
        if store == LESSONS:
            return [(str(lesson.id), lesson_record(lesson)) for lesson in lessons]
        grouped: dict[str, list[Any]] = {str(lesson.id): [] for lesson in lessons}
        rows = await session.execute(
            select(LessonSegment.lesson_id, LessonSegment.data)
            .where(LessonSegment.lesson_id == _any([lesson.id for lesson in lessons], Uuid()))
            .order_by(LessonSegment.lesson_id, LessonSegment.position)
        )
        for lesson_id, data in rows:
            grouped[str(lesson_id)].append(data)
        return list(grouped.items())
    table = TABLES[store]
    rows = await session.execute(
        select(table.c.id, table.c.data).where(table.c.user_id == user_id, table.c.id == _any(ids, Text()))
    )
    return list(rows.tuples())


def _digest(store: str, records: list[Record]) -> Digest:
    hashed = records
    if settings.import_fault == store and records:
        hashed = sorted(records, key=lambda record: record[0].encode())[1:]
    return Digest(count=len(records), sha256=store_hash(hashed))


async def store_digest(session: AsyncSession, user_id: uuid.UUID, store: str, ids: list[str]) -> Digest:
    return _digest(store, await stored_records(session, user_id, store, ids))


async def quarantine_digest(
    session: AsyncSession, user_id: uuid.UUID, source: str, keys: list[QuarantineKey]
) -> Digest:
    key = QuarantinedRecord.store + literal(":") + QuarantinedRecord.record_id
    rows = await session.execute(
        select(key, QuarantinedRecord.raw).where(
            QuarantinedRecord.user_id == user_id,
            QuarantinedRecord.source == source,
            key == _any([f"{k.store}:{k.record_id}" for k in keys], Text()),
        )
    )
    return _digest("quarantine", list(rows.tuples()))


async def media_object(session: AsyncSession, user_id: uuid.UUID, key: MediaKey) -> MediaObject | None:
    return await session.scalar(
        select(MediaObject)
        .where(
            MediaObject.user_id == user_id,
            MediaObject.lesson_id == key.lesson_id,
            MediaObject.kind == MediaKind(key.kind),
            MediaObject.segment_id.is_not_distinct_from(key.segment_id),
        )
        .order_by(MediaObject.created_at.desc())
        .limit(1)
    )


async def media_digest(session: AsyncSession, user_id: uuid.UUID, key: MediaKey) -> MediaDigest | None:
    media = await media_object(session, user_id, key)
    if media is None:
        return None
    return MediaDigest(**key.model_dump(), size=media.size, sha256=media.sha256)
