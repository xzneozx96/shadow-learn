import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.deps import CurrentUser
from app.db import get_session
from app.lessons.models import Lesson, LessonSegment
from app.lessons.router import owned_lesson
from app.lessons.services.audio import ensure_temp_dir
from app.media.models import MediaKind
from app.media.service import CONTENT_TYPES, media_url, store_file

router = APIRouter(prefix="/api/testing", tags=["testing"])

Session = Annotated[AsyncSession, Depends(get_session)]

_EXTS = {content_type: ext for ext, content_type in CONTENT_TYPES.items()}


class SeedSegment(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    start: float
    end: float


class SeedLesson(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    source: str = "upload"
    source_url: str | None = None
    duration: float
    source_language: str = "zh-CN"
    translation_languages: list[str] = Field(default_factory=lambda: ["en"])
    meta: dict[str, Any] = Field(default_factory=dict)
    segments: list[SeedSegment] = Field(default_factory=list)


@router.post("/lessons", status_code=201)
async def seed_lesson(body: SeedLesson, session: Session, user: CurrentUser) -> dict[str, str]:
    lesson = Lesson(
        user_id=user.id,
        title=body.title,
        source=body.source,
        source_url=body.source_url,
        duration_s=body.duration,
        source_language=body.source_language,
        translation_languages=body.translation_languages,
        meta=body.meta,
    )
    session.add(lesson)
    await session.flush()
    session.add_all(
        LessonSegment(lesson_id=lesson.id, position=i, data=seg.model_dump(), start_s=seg.start, end_s=seg.end)
        for i, seg in enumerate(body.segments)
    )
    await session.commit()
    return {"id": str(lesson.id)}


@router.put("/lessons/{lesson_id}/media")
async def seed_lesson_media(
    lesson_id: uuid.UUID,
    request: Request,
    session: Session,
    user: CurrentUser,
    content_type: Annotated[str, Header()],
) -> dict[str, str]:
    await owned_lesson(session, lesson_id, user)
    content_type = content_type.split(";")[0].strip().lower()
    ext = _EXTS.get(content_type)
    if ext is None:
        raise HTTPException(status_code=415, detail="Media must be a known video/* or audio/* type")
    path = ensure_temp_dir() / f"{uuid.uuid4()}.{ext}"
    with path.open("wb") as f:
        async for chunk in request.stream():
            f.write(chunk)
    kind = MediaKind.video if content_type.startswith("video/") else MediaKind.audio
    media = await store_file(request.app.state.s3, user_id=user.id, kind=kind, lesson_id=lesson_id, source_path=path)
    session.add(media)
    await session.commit()
    return {"id": str(media.id), "url": media_url(media.id)}
