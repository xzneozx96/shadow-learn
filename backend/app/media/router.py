import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.deps import CurrentUser, fastapi_users
from app.accounts.models import User
from app.db import get_session
from app.lessons.router import owned_lesson
from app.lessons.services.audio import ensure_temp_dir
from app.media.models import MediaKind, MediaObject
from app.media.service import (
    CONTENT_TYPES,
    delete_objects,
    media_token_grants,
    media_url,
    mint_media_token,
    store_file,
    stream,
)
from app.settings import settings

router = APIRouter(tags=["media"])

Session = Annotated[AsyncSession, Depends(get_session)]
OptionalUser = Annotated[User | None, Depends(fastapi_users.current_user(active=True, optional=True))]

MAX_SHADOWING_AUDIO_BYTES = 20 * 1024 * 1024
_SHADOWING_EXTS = {
    content_type: ext for ext, content_type in CONTENT_TYPES.items() if content_type.startswith("audio/")
}
_SHADOWING_EXTS["audio/webm"] = "webm"


@router.get("/api/media/{media_id}")
async def get_media(
    media_id: str,
    request: Request,
    session: Session,
    user: OptionalUser,
    token: str | None = None,
    range_header: Annotated[str | None, Header(alias="Range")] = None,
) -> Response:
    """Stream one media object to its owner's bearer or to a ``?token=`` ticket for this id.

    ``<video>`` and ``<audio>`` cannot send headers, so the ticket is the capability.
    The id is parsed by hand so a request without credentials is a 401 before any 422.
    """
    ticketed = token is not None and media_token_grants(token, media_id)
    if user is None and not ticketed:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        media = await session.get(MediaObject, uuid.UUID(media_id))
    except ValueError:
        media = None
    if media is None:
        raise HTTPException(status_code=404, detail="Media not found")
    if not ticketed and media.user_id != user.id:
        if token is not None:
            raise HTTPException(status_code=401, detail="Unauthorized")
        raise HTTPException(status_code=404, detail="Media not found")
    return await stream(request.app.state.s3, media, range_header)


@router.post("/api/media/{media_id}/ticket")
async def mint_ticket(media_id: uuid.UUID, session: Session, user: CurrentUser) -> dict:
    media = await session.get(MediaObject, media_id)
    if media is None or media.user_id != user.id:
        raise HTTPException(status_code=404, detail="Media not found")
    return {
        "token": mint_media_token(media_id),
        "url": media_url(media_id),
        "expires_in": settings.media_token_minutes * 60,
    }


async def _shadowing_media(
    session: AsyncSession, user: User, lesson_id: uuid.UUID, segment_id: str
) -> MediaObject | None:
    return await session.scalar(
        select(MediaObject).where(
            MediaObject.user_id == user.id,
            MediaObject.lesson_id == lesson_id,
            MediaObject.segment_id == segment_id,
            MediaObject.kind == MediaKind.shadowing,
        )
    )


@router.put("/api/lessons/{lesson_id}/segments/{segment_id}/shadowing-audio")
async def put_shadowing_audio(
    lesson_id: uuid.UUID,
    segment_id: str,
    request: Request,
    session: Session,
    user: CurrentUser,
    content_type: Annotated[str, Header()],
) -> dict:
    """Store the caller's recording for one segment, replacing any earlier one."""
    await owned_lesson(session, lesson_id, user)
    ext = _SHADOWING_EXTS.get(content_type.split(";")[0].strip().lower())
    if ext is None:
        raise HTTPException(status_code=415, detail="Shadowing audio must be an audio/* body")

    path = ensure_temp_dir() / f"{uuid.uuid4()}.{ext}"
    received = 0
    try:
        with path.open("wb") as f:
            async for chunk in request.stream():
                received += len(chunk)
                if received > MAX_SHADOWING_AUDIO_BYTES:
                    raise HTTPException(status_code=413, detail="Shadowing audio is too large")
                f.write(chunk)
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    if received == 0:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Shadowing audio is empty")

    s3 = request.app.state.s3
    media = await store_file(
        s3, user_id=user.id, kind=MediaKind.shadowing, lesson_id=lesson_id, source_path=path, segment_id=segment_id
    )
    previous = await _shadowing_media(session, user, lesson_id, segment_id)
    if previous is not None:
        await session.delete(previous)
        await session.flush()
    session.add(media)
    await session.commit()
    if previous is not None:
        await delete_objects(s3, [previous.object_key])
    return {"id": str(media.id), "size": media.size, "sha256": media.sha256, "url": media_url(media.id)}


@router.get("/api/lessons/{lesson_id}/segments/{segment_id}/shadowing-audio")
async def get_shadowing_audio(
    lesson_id: uuid.UUID,
    segment_id: str,
    request: Request,
    session: Session,
    user: CurrentUser,
    range_header: Annotated[str | None, Header(alias="Range")] = None,
) -> Response:
    media = await _shadowing_media(session, user, lesson_id, segment_id)
    if media is None:
        raise HTTPException(status_code=404, detail="Shadowing audio not found")
    return await stream(request.app.state.s3, media, range_header)
