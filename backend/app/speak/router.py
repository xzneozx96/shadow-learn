"""Speak router: AI conversation session management."""

import logging
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/speak")

# In-memory session cache: session_id -> session data
session_cache: dict[str, dict[str, Any]] = {}


# --------------------------------------------------------------------------- #
# Request/Response models
# --------------------------------------------------------------------------- #


class SessionStartRequest(BaseModel):
    """Request to start a new AI conversation session."""
    
    google_key: str = Field(..., min_length=1, description="User's Google Gemini API key")
    persona_id: str = Field(..., pattern=r"^[a-z_]+$", description="Persona ID")
    situation_id: str = Field(..., pattern=r"^[a-z_]+$", description="Situation ID")
    mode: str = Field(default="free", pattern=r"^(free|guided)$", description="Session mode")


class SessionStartResponse(BaseModel):
    """Response after starting a session."""
    
    livekit_url: str
    livekit_token: str
    session_id: str


class SessionEndRequest(BaseModel):
    """Request to end a session."""
    
    session_id: str = Field(..., min_length=1)


# --------------------------------------------------------------------------- #
# Helper functions
# --------------------------------------------------------------------------- #


def _generate_livekit_token(session_id: str, persona_id: str, google_key: str, situation_id: str) -> str:
    """Generate a LiveKit token with embedded credentials for the agent."""
    try:
        from livekit import AccessToken
    except ImportError:
        logger.warning("livekit package not installed, returning mock token")
        return f"mock-token-{session_id}-{uuid.uuid4().hex[:8]}"

    if not settings.livekit_api_key or not settings.livekit_api_secret:
        logger.warning("LiveKit credentials not configured, returning mock token")
        return f"mock-token-{session_id}-{uuid.uuid4().hex[:8]}"

    token = AccessToken(
        settings.livekit_api_key,
        settings.livekit_api_secret,
        identity=f"agent-{session_id}",
        name=f"ShadowLearn-{session_id}",
    )
    
    token.can_edit = True
    token.metadata = f"session_id={session_id},persona_id={persona_id},situation_id={situation_id},google_key={google_key}"
    
    return token.to_jwt()


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #


@router.post("/session-start", response_model=SessionStartResponse)
async def session_start(request: SessionStartRequest) -> SessionStartResponse:
    """Start a new AI conversation session."""
    session_id = f"session-{uuid.uuid4().hex[:12]}"
    
    livekit_token = _generate_livekit_token(
        session_id, 
        request.persona_id, 
        request.google_key,
        request.situation_id
    )
    
    livekit_url = settings.livekit_url or "wss://your-project.livekit.cloud"
    
    session_cache[session_id] = {
        "session_id": session_id,
        "persona_id": request.persona_id,
        "situation_id": request.situation_id,
        "mode": request.mode,
    }
    
    logger.info(f"[session_start] Session started: {session_id}, persona={request.persona_id}, situation={request.situation_id}")
    
    return SessionStartResponse(
        livekit_url=livekit_url,
        livekit_token=livekit_token,
        session_id=session_id,
    )


@router.post("/session-end")
async def session_end(request: SessionEndRequest) -> dict[str, str]:
    """End an AI conversation session and cleanup resources."""
    session_id = request.session_id
    
    if session_id not in session_cache:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    
    del session_cache[session_id]
    
    logger.info(f"[session_end] Session ended: {session_id}")
    
    return {"session_id": session_id, "status": "ended"}