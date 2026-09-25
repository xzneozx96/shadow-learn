import hmac
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.keys.models import Provider
from app.keys.service import resolve_provider_key
from app.settings import settings
from app.speak.models import SESSION_TTL, SpeakLiveSession


def require_internal_token(authorization: Annotated[str | None, Header()] = None) -> None:
    expected = settings.offshore_internal_token.encode()
    scheme, _, presented = (authorization or "").partition(" ")
    if not expected or scheme != "Bearer" or not hmac.compare_digest(presented.encode(), expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


router = APIRouter(prefix="/api/internal", dependencies=[Depends(require_internal_token)])


@router.get("/speak-sessions/{session_id}/google-key")
async def speak_session_google_key(
    session_id: str, request: Request, session: Annotated[AsyncSession, Depends(get_session)]
) -> dict[str, str]:
    live = await session.get(SpeakLiveSession, session_id)
    if live is None or live.created_at < datetime.now(UTC) - SESSION_TTL:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown speak session")
    resolved = await resolve_provider_key(session, live.user_id, Provider.google, request.scope["route"].path)
    return {"google_key": resolved.value, "source": resolved.source}
