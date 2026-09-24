import hashlib
import uuid
from typing import Annotated, Any, Literal
from urllib.parse import quote

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile
from pydantic import AwareDatetime, BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.deps import CurrentUser
from app.db import get_session
from app.importer.canonical import canonical
from app.importer.manifest import (
    LESSONS,
    RECORD_STORES,
    SEGMENTS,
    Camel,
    Digest,
    ImportKind,
    MediaDigest,
    MediaKey,
    QuarantineKey,
    iso_ms,
    media_digest,
    media_object,
    quarantine_digest,
    store_digest,
    stored_records,
)
from app.importer.models import QuarantinedRecord
from app.lessons.models import Lesson, LessonSegment
from app.lessons.router import owned_lesson
from app.lessons.services.audio import ensure_temp_dir
from app.media.models import MediaKind
from app.media.service import CONTENT_TYPES, delete_objects, put_file, store_file
from app.settings import settings
from app.userdata.merge import DOMINANCE
from app.userdata.specs import STORES

router = APIRouter(prefix="/api/import", tags=["import"])

Session = Annotated[AsyncSession, Depends(get_session)]
Source = Annotated[str, Field(min_length=1, max_length=100)]
MEDIA_STORE = "media"

_CHUNK_SIZE = 1024 * 1024
_EXTENSIONS = {content_type: ext for ext, content_type in CONTENT_TYPES.items()} | {"audio/webm": "webm"}
_DEFAULT_CONTENT_TYPES = {ImportKind.video: "video/mp4", ImportKind.audio: "audio/mpeg", ImportKind.shadowing: "audio/webm"}


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
    segments: list[dict[str, Any]]


class LessonsImport(BaseModel):
    lessons: list[ImportedLesson]
    source: Source | None = None


class QuarantinedItem(Camel):
    store: str
    record_id: str
    raw: Any
    error: list[dict[str, Any]]


class QuarantineImport(Camel):
    source: Source
    records: list[QuarantinedItem]


class ManifestRequest(Camel):
    source: Source
    stores: dict[str, list[str]]
    present: dict[str, list[str]] = Field(default_factory=dict)
    dominance: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)
    quarantine: list[QuarantineKey] = Field(default_factory=list)
    media: list[MediaKey] = Field(default_factory=list)
    quarantined_media: list[MediaKey] = Field(default_factory=list)


class ManifestResponse(Camel):
    stores: dict[str, Digest]
    present: dict[str, int] = Field(default_factory=dict)
    undominated: dict[str, list[str]] = Field(default_factory=dict)
    quarantine: Digest
    media: list[MediaDigest | None]
    quarantined_media: list[MediaDigest | None] = Field(default_factory=list)


def _seconds(segment: dict[str, Any], field: str) -> float:
    value = segment.get(field)
    return float(value) if isinstance(value, int | float) and not isinstance(value, bool) else 0.0


class ImportedLessonState(BaseModel):
    lesson: dict[str, Any]
    segments: list[Any]


LessonOutcome = Literal["stored", "kept_server", "conflict"]


class LessonsImported(BaseModel):
    count: int
    after: list[ImportedLessonState]
    outcomes: dict[str, LessonOutcome]


def _sent_record(item: ImportedLesson) -> dict[str, Any]:
    return {
        "id": str(item.id),
        "title": item.title,
        "source": item.source,
        "sourceUrl": item.source_url,
        "duration": item.duration,
        "sourceLanguage": item.source_language,
        "translationLanguages": item.translation_languages,
        "createdAt": iso_ms(item.created_at),
        "lastOpenedAt": iso_ms(item.last_opened_at) if item.last_opened_at else None,
        "meta": item.meta,
    }


@router.post("/lessons")
async def import_lessons(body: LessonsImport, user: CurrentUser, session: Session) -> LessonsImported:
    """Create or refresh each lesson this device sends, and return what the account now holds.

    A lesson this device imported before takes its newer copy while the account has
    not edited it. When the account edited it and the device's copy is unchanged, the
    account copy stands (``kept_server``); when both changed, the outcome is
    ``conflict`` and the device keeps its copy. Segments are stored exactly as sent,
    and a segment without numeric timing indexes at 0.
    """
    incoming = {lesson.id: lesson for lesson in body.lessons}
    existing = {lesson.id: lesson for lesson in await session.scalars(select(Lesson).where(Lesson.id.in_(incoming)))}
    foreign = sorted(str(lesson_id) for lesson_id, lesson in existing.items() if lesson.user_id != user.id)
    if foreign:
        raise HTTPException(status_code=409, detail=f"Lesson {foreign[0]} was already imported into another account")
    ids = [str(lesson_id) for lesson_id in incoming]
    held = await _lesson_hashes(session, user.id, ids)
    outcomes: dict[str, LessonOutcome] = {}
    written: dict[str, Lesson] = {}
    for lesson_id, item in incoming.items():
        key, lesson = str(lesson_id), existing.get(lesson_id)
        sent = _hash([_sent_record(item), item.segments])
        if lesson is None:
            lesson = Lesson(id=lesson_id, user_id=user.id)
            session.add(lesson)
        elif held[key] == sent:
            outcomes[key] = "stored"
            continue
        elif lesson.import_source != body.source or held[key] != lesson.import_row_hash:
            outcomes[key] = "kept_server" if lesson.import_sent_hash == sent else "conflict"
            continue
        _write_lesson(lesson, item)
        await session.flush()
        await session.execute(delete(LessonSegment).where(LessonSegment.lesson_id == lesson_id))
        session.add_all(
            LessonSegment(
                lesson_id=lesson_id,
                position=position,
                data=segment,
                start_s=_seconds(segment, "start"),
                end_s=_seconds(segment, "end"),
            )
            for position, segment in enumerate(item.segments)
        )
        lesson.import_source, lesson.import_sent_hash = body.source, sent
        outcomes[key], written[key] = "stored", lesson
    await session.flush()
    for key, row_hash in (await _lesson_hashes(session, user.id, list(written))).items():
        written[key].import_row_hash = row_hash
    await session.commit()
    lessons = dict(await stored_records(session, user.id, LESSONS, ids))
    segments = dict(await stored_records(session, user.id, SEGMENTS, ids))
    return LessonsImported(
        count=len(incoming),
        after=[ImportedLessonState(lesson=lessons[lesson_id], segments=segments[lesson_id]) for lesson_id in ids],
        outcomes=outcomes,
    )


def _hash(value: Any) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


async def _lesson_hashes(session: AsyncSession, user_id: uuid.UUID, ids: list[str]) -> dict[str, str]:
    lessons = dict(await stored_records(session, user_id, LESSONS, ids))
    segments = dict(await stored_records(session, user_id, SEGMENTS, ids))
    return {key: _hash([lesson, segments[key]]) for key, lesson in lessons.items()}


def _write_lesson(lesson: Lesson, item: ImportedLesson) -> None:
    lesson.title = item.title
    lesson.source = item.source
    lesson.source_url = item.source_url
    lesson.duration_s = item.duration
    lesson.source_language = item.source_language
    lesson.translation_languages = item.translation_languages
    lesson.created_at = item.created_at
    lesson.last_opened_at = item.last_opened_at
    lesson.meta = item.meta


@router.post("/quarantine")
async def quarantine(body: QuarantineImport, user: CurrentUser, session: Session) -> dict[str, int]:
    """Keep records the store schemas reject, or that conflict with the account's copy, verbatim.

    Either way the device can delete its copy. A conflict's error gets the hash of the
    account's copy as the server holds it now, whatever the device sent for it.
    """
    unknown = sorted({item.store for item in body.records} - RECORD_STORES)
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown store {unknown[0]}")
    for store in {item.store for item in body.records if _is_conflict(item)}:
        conflicts = [item for item in body.records if item.store == store and _is_conflict(item)]
        hashes = await _account_hashes(session, user.id, store, [item.record_id for item in conflicts])
        for item in conflicts:
            item.error = [
                {**error, "accountSha256": hashes.get(item.record_id)} if error.get("type") == "conflict" else error
                for error in item.error
            ]
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


def _is_conflict(item: QuarantinedItem) -> bool:
    return any(error.get("type") == "conflict" for error in item.error)


async def _account_hashes(session: AsyncSession, user_id: uuid.UUID, store: str, ids: list[str]) -> dict[str, str]:
    if store == LESSONS:
        return await _lesson_hashes(session, user_id, ids)
    return {record_id: _hash(record) for record_id, record in await stored_records(session, user_id, store, ids)}


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
    quarantine: Annotated[bool, Form()] = False,
    source: Annotated[str | None, Form(pattern=r"^[A-Za-z0-9-]{1,100}$")] = None,
) -> MediaDigest:
    """Store one legacy blob for an imported lesson, replacing a different earlier copy and keeping an equal one.

    With ``quarantine``, the blob belongs to a lesson that changed on both sides and
    differs from the account's file. It is kept for repair under its own key, and the
    account's media is never touched.
    """
    if (kind is ImportKind.shadowing) != (segment_id is not None):
        raise HTTPException(status_code=422, detail="segment_id goes with kind=shadowing and only with it")
    if quarantine and source is None:
        raise HTTPException(status_code=422, detail="quarantine needs the device source")
    await owned_lesson(session, lesson_id, user)
    key = MediaKey(lesson_id=lesson_id, kind=kind, segment_id=segment_id)
    if quarantine:
        return await _quarantine_media(request.app.state.s3, session, user.id, source, key, file)
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
    try:
        if previous is not None:
            await session.delete(previous)
            await session.flush()
        session.add(media)
        await session.commit()
    except BaseException:
        await delete_objects(s3, [media.object_key])
        raise
    if previous is not None:
        await delete_objects(s3, [previous.object_key])
    return MediaDigest(**key.model_dump(), size=media.size, sha256=media.sha256)


def _media_record_id(key: MediaKey) -> str:
    return f"{key.lesson_id}:{key.kind}:{key.segment_id or ''}"


async def _quarantine_media(s3, session: AsyncSession, user_id: uuid.UUID, source: str, key: MediaKey, file: UploadFile) -> MediaDigest:
    object_key = f"import-quarantine/{user_id}/{source}/{key.lesson_id}/{key.kind}"
    if key.segment_id is not None:
        object_key += f"/{quote(key.segment_id, safe='')}"
    path, _, _ = await _receive(file, key.kind)
    try:
        size, sha256 = await put_file(s3, object_key, path, _content_type(file, key.kind))
    finally:
        path.unlink(missing_ok=True)
    account = await media_object(session, user_id, key)
    row = {
        "user_id": user_id,
        "source": source,
        "store": MEDIA_STORE,
        "record_id": _media_record_id(key),
        "raw": {"objectKey": object_key, "sha256": sha256, "size": size, "kind": str(key.kind), "lessonId": str(key.lesson_id), "segmentId": key.segment_id},
        "error": [{"type": "conflict-media", "accountSha256": account.sha256 if account else None}],
    }
    stmt = insert(QuarantinedRecord)
    await session.execute(
        stmt.on_conflict_do_update(
            index_elements=["user_id", "source", "store", "record_id"],
            set_={"raw": stmt.excluded.raw, "error": stmt.excluded.error},
        ),
        [row],
    )
    await session.commit()
    return MediaDigest(**key.model_dump(), size=size, sha256=sha256)


async def _quarantined_media(s3, session: AsyncSession, user_id: uuid.UUID, source: str, key: MediaKey) -> MediaDigest | None:
    """The blob kept for repair, only while its object still exists at the size recorded."""
    raw = await session.scalar(
        select(QuarantinedRecord.raw).where(
            QuarantinedRecord.user_id == user_id,
            QuarantinedRecord.source == source,
            QuarantinedRecord.store == MEDIA_STORE,
            QuarantinedRecord.record_id == _media_record_id(key),
        )
    )
    if raw is None:
        return None
    try:
        head = await s3.head_object(Bucket=settings.s3_bucket, Key=raw["objectKey"])
    except ClientError as err:
        if err.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise
    if head["ContentLength"] != raw["size"]:
        return None
    return MediaDigest(**key.model_dump(), size=raw["size"], sha256=raw["sha256"])


async def _undominated(session: AsyncSession, user_id: uuid.UUID, store: str, local: list[dict[str, Any]]) -> list[str]:
    """The ids whose stored record does not yet reflect everything in the device's copy, by the store's merge rule."""
    spec = STORES[store]
    dominates = DOMINANCE[spec.merge]
    by_id = {spec.record_id(record): record for record in local}
    stored = dict(await stored_records(session, user_id, store, list(by_id)))
    return sorted(record_id for record_id, record in by_id.items() if record_id not in stored or not dominates(stored[record_id], record))


@router.post("/manifest")
async def manifest(body: ManifestRequest, request: Request, user: CurrentUser, session: Session) -> ManifestResponse:
    """Digest the caller's stored copy of exactly the records and blobs this device sent."""
    unknown = sorted((body.stores.keys() | body.present.keys()) - RECORD_STORES) or sorted(body.dominance.keys() - STORES.keys())
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown store {unknown[0]}")
    return ManifestResponse(
        stores={store: await store_digest(session, user.id, store, ids) for store, ids in body.stores.items()},
        present={store: len(await stored_records(session, user.id, store, ids)) for store, ids in body.present.items()},
        undominated={store: await _undominated(session, user.id, store, local) for store, local in body.dominance.items()},
        quarantine=await quarantine_digest(session, user.id, body.source, body.quarantine),
        media=[await media_digest(session, user.id, key) for key in body.media],
        quarantined_media=[
            await _quarantined_media(request.app.state.s3, session, user.id, body.source, key) for key in body.quarantined_media
        ],
    )
