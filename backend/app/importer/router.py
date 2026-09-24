import hashlib
import uuid
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.deps import CurrentUser
from app.db import get_session
from app.importer.manifest import (
    RECORD_STORES,
    Camel,
    Digest,
    ImportKind,
    MediaDigest,
    MediaKey,
    QuarantineKey,
    media_digest,
    media_object,
    quarantine_digest,
    store_digest,
)
from app.importer.models import QuarantinedRecord
from app.lessons.models import Lesson, LessonSegment
from app.lessons.router import owned_lesson
from app.lessons.services.audio import ensure_temp_dir
from app.media.models import MediaKind
from app.media.service import CONTENT_TYPES, delete_objects, store_file
from app.settings import settings

router = APIRouter(prefix="/api/import", tags=["import"])

Session = Annotated[AsyncSession, Depends(get_session)]
Source = Annotated[str, Field(min_length=1, max_length=100)]

_CHUNK_SIZE = 1024 * 1024
_EXTENSIONS = {content_type: ext for ext, content_type in CONTENT_TYPES.items()} | {"audio/webm": "webm"}
_DEFAULT_CONTENT_TYPES = {ImportKind.video: "video/mp4", ImportKind.audio: "audio/mpeg", ImportKind.shadowing: "audio/webm"}


class ImportedSegment(BaseModel):
    model_config = ConfigDict(extra="allow")

    start: float
    end: float


class ImportedLesson(Camel):
    id: uuid.UUID
    title: str
    source: Literal["youtube", "upload", "blog"]
    source_url: str | None
    duration: float
    source_language: str
    translation_languages: list[str]
    created_at: AwareDatetime
    last_opened_at: AwareDatetime | None
    meta: dict[str, Any]
    segments: list[ImportedSegment]


class LessonsImport(BaseModel):
    lessons: list[ImportedLesson]


class QuarantinedItem(Camel):
    store: str
    record_id: str
    raw: Any
    error: str


class QuarantineImport(Camel):
    source: Source
    records: list[QuarantinedItem]


class ManifestRequest(Camel):
    source: Source
    stores: dict[str, list[str]]
    quarantine: list[QuarantineKey] = Field(default_factory=list)
    media: list[MediaKey] = Field(default_factory=list)


class ManifestResponse(BaseModel):
    stores: dict[str, Digest]
    quarantine: Digest
    media: list[MediaDigest | None]


@router.post("/lessons")
async def import_lessons(body: LessonsImport, user: CurrentUser, session: Session) -> dict[str, int]:
    """Create or overwrite each lesson and its segments, so a rerun converges on what the device sent."""
    incoming = {lesson.id: lesson for lesson in body.lessons}
    existing = {lesson.id: lesson for lesson in await session.scalars(select(Lesson).where(Lesson.id.in_(incoming)))}
    foreign = sorted(str(lesson_id) for lesson_id, lesson in existing.items() if lesson.user_id != user.id)
    if foreign:
        raise HTTPException(status_code=409, detail=f"Lesson {foreign[0]} was already imported into another account")
    for lesson_id, item in incoming.items():
        lesson = existing.get(lesson_id)
        if lesson is None:
            lesson = Lesson(id=lesson_id, user_id=user.id)
            session.add(lesson)
        lesson.title = item.title
        lesson.source = item.source
        lesson.source_url = item.source_url
        lesson.duration_s = item.duration
        lesson.source_language = item.source_language
        lesson.translation_languages = item.translation_languages
        lesson.created_at = item.created_at
        lesson.last_opened_at = item.last_opened_at
        lesson.meta = item.meta
    await session.flush()
    await session.execute(delete(LessonSegment).where(LessonSegment.lesson_id.in_(incoming)))
    session.add_all(
        LessonSegment(
            lesson_id=lesson_id,
            position=position,
            data=segment.model_dump(mode="json", exclude_unset=True),
            start_s=segment.start,
            end_s=segment.end,
        )
        for lesson_id, item in incoming.items()
        for position, segment in enumerate(item.segments)
    )
    await session.commit()
    return {"count": len(incoming)}


@router.post("/quarantine")
async def quarantine(body: QuarantineImport, user: CurrentUser, session: Session) -> dict[str, int]:
    """Keep records the store schemas reject, verbatim, so the device can still delete its copy."""
    unknown = sorted({item.store for item in body.records} - RECORD_STORES)
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown store {unknown[0]}")
    rows = {
        (item.store, item.record_id): {
            "user_id": user.id,
            "source": body.source,
            "store": item.store,
            "record_id": item.record_id,
            "raw": item.raw,
            "error": item.error,
        }
        for item in body.records
    }
    if rows:
        stmt = insert(QuarantinedRecord)
        await session.execute(
            stmt.on_conflict_do_update(
                index_elements=["user_id", "source", "store", "record_id"],
                set_={"raw": stmt.excluded.raw, "error": stmt.excluded.error},
            ),
            list(rows.values()),
        )
        await session.commit()
    return {"count": len(rows)}


def _content_type(upload: UploadFile, kind: ImportKind) -> str:
    content_type = (upload.content_type or "").split(";")[0].strip().lower()
    return content_type if content_type in _EXTENSIONS else _DEFAULT_CONTENT_TYPES[kind]


async def _receive(upload: UploadFile, kind: ImportKind):
    path = ensure_temp_dir() / f"{uuid.uuid4()}.{_EXTENSIONS[_content_type(upload, kind)]}"
    digest, size = hashlib.sha256(), 0
    try:
        with path.open("wb") as f:
            while chunk := await upload.read(_CHUNK_SIZE):
                size += len(chunk)
                if size > settings.max_upload_size_bytes:
                    raise HTTPException(status_code=413, detail="Media file is too large")
                digest.update(chunk)
                f.write(chunk)
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    return path, size, digest.hexdigest()


@router.post("/media")
async def import_media(
    request: Request,
    user: CurrentUser,
    session: Session,
    lesson_id: Annotated[uuid.UUID, Form()],
    kind: Annotated[ImportKind, Form()],
    file: UploadFile,
    segment_id: Annotated[str | None, Form()] = None,
) -> MediaDigest:
    """Store one legacy blob for an imported lesson, replacing a different earlier copy and keeping an equal one."""
    if (kind is ImportKind.shadowing) != (segment_id is not None):
        raise HTTPException(status_code=422, detail="segment_id goes with kind=shadowing and only with it")
    await owned_lesson(session, lesson_id, user)
    key = MediaKey(lesson_id=lesson_id, kind=kind, segment_id=segment_id)
    path, size, sha256 = await _receive(file, kind)
    try:
        lock = f"import-media:{user.id}:{lesson_id}:{kind}:{segment_id or ''}"
        await session.execute(select(func.pg_advisory_xact_lock(func.hashtext(lock))))
        previous = await media_object(session, user.id, key)
        if previous is not None and previous.size == size and previous.sha256 == sha256:
            return MediaDigest(**key.model_dump(), size=size, sha256=sha256)
        s3 = request.app.state.s3
        media = await store_file(
            s3, user_id=user.id, kind=MediaKind(kind), lesson_id=lesson_id, source_path=path, segment_id=segment_id
        )
    finally:
        path.unlink(missing_ok=True)
    if previous is not None:
        await session.delete(previous)
        await session.flush()
    session.add(media)
    await session.commit()
    if previous is not None:
        await delete_objects(s3, [previous.object_key])
    return MediaDigest(**key.model_dump(), size=media.size, sha256=media.sha256)


@router.post("/manifest")
async def manifest(body: ManifestRequest, user: CurrentUser, session: Session) -> ManifestResponse:
    """Digest the caller's stored copy of exactly the records and blobs this device sent."""
    unknown = sorted(body.stores.keys() - RECORD_STORES)
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown store {unknown[0]}")
    return ManifestResponse(
        stores={store: await store_digest(session, user.id, store, ids) for store, ids in body.stores.items()},
        quarantine=await quarantine_digest(session, user.id, body.source, body.quarantine),
        media=[await media_digest(session, user.id, key) for key in body.media],
    )
