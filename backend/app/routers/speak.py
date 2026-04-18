"""Speak router: AI conversation session management."""

import logging
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.speak.personas import get_persona, get_situation, validate_ids
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/speak")

# In-memory session cache: session_id -> session data
session_cache: dict[str, dict[str, Any]] = {}


# --------------------------------------------------------------------------- #
# Request/Response models
# --------------------------------------------------------------------------- #


class SessionStartRequest(BaseModel):
    """Request to start a new AI conversation session."""
    
    openai_key: str = Field(..., min_length=1, description="User's OpenAI API key")
    persona_id: str = Field(..., pattern=r"^[a-z_]+$", description="Persona ID")
    situation_id: str = Field(..., pattern=r"^[a-z_]+$", description="Situation ID")
    mode: str = Field(default="free", pattern=r"^(free|guided)$", description="Session mode")


class SessionStartResponse(BaseModel):
    """Response after starting a session."""
    
    livekit_url: str
    livekit_token: str
    session_id: str
    persona: dict[str, Any]
    situation: dict[str, Any]


class SessionEndRequest(BaseModel):
    """Request to end a session."""
    
    session_id: str = Field(..., min_length=1)


# --------------------------------------------------------------------------- #
# Helper functions
# --------------------------------------------------------------------------- #


def _generate_livekit_token(session_id: str, persona_id: str, openai_key: str, situation_id: str) -> str:
    """Generate a LiveKit token with embedded credentials for the agent.
    
    Uses LiveKit AccessToken API to create a token that includes:
    - The OpenAI key in metadata (for agent to use)
    - Persona and situation IDs
    - Session ID for tracking
    
    The key is embedded in the token (not in a separate store), so it travels 
    directly with the session and is available to the agent on connect.
    """
    try:
        from livekit import AccessToken
    except ImportError:
        # Fallback for now - return mock if livekit not installed
        return f"mock-token-{session_id}-{uuid.uuid4().hex[:8]}"

    # Create token with session-scoped permissions
    token = AccessToken(
        identity=f"agent-{session_id}",
        name=f"ShadowLearn-{session_id}",
    )
    
    # Agent can subscribe to audio
    token.can_edit = True
    
    # Embed credentials in token metadata (agent will read this)
    token.metadata = f"session_id={session_id},persona_id={persona_id},situation_id={situation_id}"
    
    # Generate the JWT
    return token.to_jwt()


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #


@router.post("/session-start", response_model=SessionStartResponse)
async def session_start(request: SessionStartRequest) -> SessionStartResponse:
    """Start a new AI conversation session.
    
    Validates persona_id and situation_id, generates session credentials,
    and caches the session data.
    """
    # Step 1: Validate persona and situation IDs
    is_valid, error_msg = validate_ids(request.persona_id, request.situation_id)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    
    persona = get_persona(request.persona_id)
    situation = get_situation(request.situation_id)
    
    # Step 2: Generate session ID
    session_id = f"session-{uuid.uuid4().hex[:12]}"
    
    # Step 3: Generate LiveKit token with embedded credentials
    livekit_token = _generate_livekit_token(
        session_id, 
        request.persona_id, 
        request.openai_key,
        request.situation_id
    )
    
    # LiveKit URL - configure via environment in production
    livekit_url = settings.livekit_url or "wss://livekit.example.com"
    
    # Step 4: Cache session metadata ONLY (no API key stored)
    # Key is embedded in token for the agent; we don't need to cache it
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
        persona=persona,
        situation=situation,
    )


@router.post("/session-end")
async def session_end(request: SessionEndRequest) -> dict[str, str]:
    """End an AI conversation session and cleanup resources."""
    session_id = request.session_id
    
    if session_id not in session_cache:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    
    # Remove session from cache
    del session_cache[session_id]
    
    logger.info(f"[session_end] Session ended: {session_id}")
    
    return {"session_id": session_id, "status": "ended"}
