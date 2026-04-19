"""Speak router: AI conversation session management."""

import logging
import uuid
from urllib.parse import quote
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
    system_prompt: str = Field(..., min_length=10, description="System prompt for the AI agent")
    voice_id: str = Field(default="Puck", description="Voice ID for Gemini Live API")
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


def _generate_livekit_token(
    session_id: str,
    persona_id: str,
    google_key: str,
    situation_id: str,
    system_prompt: str = "",
    voice_id: str = "Puck",
) -> str:
    """Generate a LiveKit token with embedded credentials for the agent.

    Uses LiveKit AccessToken API to create a token that includes:
    - RoomAgentDispatch with agent_name for automatic agent dispatch
    - The Google key in metadata (for agent to use)
    - Persona, situation IDs, system_prompt, and voice_id
    - Session ID for tracking
    """
    try:
        from livekit import api
    except ImportError:
        logger.warning("livekit package not installed, returning mock token")
        return f"mock-token-{session_id}-{uuid.uuid4().hex[:8]}"

    if not settings.livekit_api_key or not settings.livekit_api_secret:
        logger.warning("LiveKit credentials not configured, returning mock token")
        return f"mock-token-{session_id}-{uuid.uuid4().hex[:8]}"

    # Create token with session-scoped permissions
    # Use the fluent builder API from livekit-api package
    token = api.AccessToken(
        settings.livekit_api_key,
        settings.livekit_api_secret,
    ).with_identity(f"user-{session_id}").with_name(f"ShadowLearn-User-{session_id}").with_metadata(
        f"session_id={session_id},persona_id={persona_id},situation_id={situation_id},google_key={google_key},system_prompt={quote(system_prompt)},voice_id={quote(voice_id)}",
    ).with_grants(
        api.VideoGrants(
            room_join=True,
            room=f"speak-{session_id}",
            can_publish=True,
            can_subscribe=True,
        ),
    )

    # Add agent dispatch configuration so LiveKit knows which agent to start
    # The agent_name must match a deployed agent in LiveKit Cloud
    token = token.with_room_config(
        api.RoomConfiguration(
            agents=[
                api.RoomAgentDispatch(
                    agent_name="shadowlearn-speak",
                ),
            ],
        ),
    )

    # Generate the JWT
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
        request.situation_id,
        system_prompt=request.system_prompt,
        voice_id=request.voice_id,
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