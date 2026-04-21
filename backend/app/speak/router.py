"""Speak router: AI conversation session management."""

import json
import logging
import uuid
from urllib.parse import quote
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from app.speak.generation import GenerationError
from app.speak.generation import generate_situation as _generate_situation
from app.speak.personas import get_persona_voice, is_persona_supported_in
from app.speak.prompt_builder import build_system_prompt
from app.speak.situations import (
    SituationConfig,
    get_custom_situation,
    get_situation_seed,
    list_built_in_situations,
)
from app.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/speak")

# In-memory session cache: session_id -> session data
session_cache: dict[str, dict[str, Any]] = {}


class VocabItemResponse(BaseModel):
    term: str
    meaning: str


class SituationPreviewResponse(BaseModel):
    title: str
    ai_role: str
    scene_context: str
    opening_line: str
    opening_line_translation: str
    user_goal: str
    target_vocab: list[VocabItemResponse]

    @classmethod
    def from_config(cls, cfg: SituationConfig) -> "SituationPreviewResponse":
        return cls(
            title=cfg.title,
            ai_role=cfg.ai_role,
            scene_context=cfg.scene_context,
            opening_line=cfg.opening_line,
            opening_line_translation=cfg.opening_line_translation,
            user_goal=cfg.user_goal,
            target_vocab=[VocabItemResponse(term=v.term, meaning=v.meaning) for v in cfg.target_vocab],
        )


class SessionStartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    google_key: str = Field(..., min_length=1)
    persona_id: str = Field(..., pattern=r"^[a-z_]+$")
    situation_id: str = Field(..., pattern=r"^[a-z_0-9]+$")
    target_language: str = Field(..., pattern=r"^[a-z]{2}(-[A-Z]{2})?$")
    proficiency_level: Literal["beginner", "intermediate", "advanced"]
    interface_language: str = Field(default="en", pattern=r"^[a-z]{2}(-[A-Z]{2})?$")
    mode: str = Field(default="free", pattern=r"^(free|guided)$")
    force_regenerate: bool = Field(default=False)


class SessionStartResponse(BaseModel):
    livekit_url: str
    livekit_token: str
    session_id: str
    situation: SituationPreviewResponse


class SessionEndRequest(BaseModel):
    session_id: str = Field(..., min_length=1)


class GenerateSituationRequest(BaseModel):
    user_text: str = Field(..., min_length=10, max_length=500)
    language: str = Field(..., pattern=r"^[a-z]{2}(-[A-Z]{2})?$")
    level: Literal["beginner", "intermediate", "advanced"]
    google_key: str = Field(..., min_length=1)
    persona_id: str = Field(..., pattern=r"^[a-z_]+$")
    interface_language: str = Field(default="en", pattern=r"^[a-z]{2}(-[A-Z]{2})?$")


class GenerateSituationResponse(BaseModel):
    situation_id: str
    title: str
    ai_role: str
    scene_context: str
    opening_line: str
    opening_line_translation: str
    user_goal: str
    target_vocab: list[VocabItemResponse]

    @classmethod
    def from_config(cls, cfg: SituationConfig) -> "GenerateSituationResponse":
        return cls(
            situation_id=cfg.id,
            title=cfg.title,
            ai_role=cfg.ai_role,
            scene_context=cfg.scene_context,
            opening_line=cfg.opening_line,
            opening_line_translation=cfg.opening_line_translation,
            user_goal=cfg.user_goal,
            target_vocab=[VocabItemResponse(term=v.term, meaning=v.meaning) for v in cfg.target_vocab],
        )


def _generate_livekit_token(
    session_id: str,
    persona_id: str,
    google_key: str,
    situation_config: SituationConfig,
    system_prompt: str,
    voice_id: str,
    target_language: str,
    proficiency_level: str,
) -> str:
    """Generate a LiveKit token carrying the full session payload in metadata."""
    try:
        from livekit import api as livekit_api
    except ImportError:
        logger.warning("livekit package not installed, returning mock token")
        return f"mock-token-{session_id}-{uuid.uuid4().hex[:8]}"

    if not settings.livekit_api_key or not settings.livekit_api_secret:
        logger.warning("LiveKit credentials not configured, returning mock token")
        return f"mock-token-{session_id}-{uuid.uuid4().hex[:8]}"

    situation_json = quote(json.dumps(situation_config.to_json_dict(), ensure_ascii=False))
    metadata = (
        f"session_id={session_id}"
        f",persona_id={persona_id}"
        f",situation_id={situation_config.id}"
        f",google_key={quote(google_key)}"
        f",system_prompt={quote(system_prompt)}"
        f",voice_id={quote(voice_id)}"
        f",situation_config={situation_json}"
        f",target_language={target_language}"
        f",proficiency_level={proficiency_level}"
    )

    token = (
        livekit_api.AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(f"user-{session_id}")
        .with_name(f"ShadowLearn-User-{session_id}")
        .with_metadata(metadata)
        .with_grants(
            livekit_api.VideoGrants(
                room_join=True,
                room=f"speak-{session_id}",
                can_publish=True,
                can_subscribe=True,
            ),
        )
        .with_room_config(
            livekit_api.RoomConfiguration(
                agents=[livekit_api.RoomAgentDispatch(agent_name="shadowlearn-speak")],
            ),
        )
    )
    return token.to_jwt()


@router.post("/session-start", response_model=SessionStartResponse)
async def session_start(request: SessionStartRequest) -> SessionStartResponse:
    """Start a new AI conversation session."""
    if not is_persona_supported_in(request.persona_id, request.target_language):
        raise HTTPException(
            status_code=400,
            detail=f"Persona {request.persona_id!r} does not support language {request.target_language!r}",
        )

    try:
        if request.situation_id.startswith("custom_"):
            situation = get_custom_situation(request.situation_id)
        else:
            seed_text = get_situation_seed(request.situation_id)
            situation = await _generate_situation(
                seed_text=seed_text,
                persona_id=request.persona_id,
                language=request.target_language,
                level=request.proficiency_level,
                google_key=request.google_key,
                situation_id=request.situation_id,
                force_regenerate=request.force_regenerate,
                interface_language=request.interface_language,
            )
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except GenerationError as e:
        logger.error(f"[session_start] Scene generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e

    try:
        voice_id = get_persona_voice(request.persona_id, request.target_language)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    try:
        system_prompt = build_system_prompt(
            persona_id=request.persona_id,
            language=request.target_language,
            level=request.proficiency_level,
            situation=situation,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    session_id = f"session-{uuid.uuid4().hex[:12]}"
    livekit_token = _generate_livekit_token(
        session_id=session_id,
        persona_id=request.persona_id,
        google_key=request.google_key,
        situation_config=situation,
        system_prompt=system_prompt,
        voice_id=voice_id,
        target_language=request.target_language,
        proficiency_level=request.proficiency_level,
    )

    livekit_url = settings.livekit_url or "wss://your-project.livekit.cloud"

    session_cache[session_id] = {
        "session_id": session_id,
        "persona_id": request.persona_id,
        "situation_id": request.situation_id,
        "target_language": request.target_language,
        "proficiency_level": request.proficiency_level,
        "mode": request.mode,
    }

    logger.info(
        f"[session_start] {session_id} persona={request.persona_id} "
        f"situation={request.situation_id} lang={request.target_language} "
        f"level={request.proficiency_level}"
    )

    return SessionStartResponse(
        livekit_url=livekit_url,
        livekit_token=livekit_token,
        session_id=session_id,
        situation=SituationPreviewResponse.from_config(situation),
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


@router.get("/situations")
async def list_situations(lang: str = Query(default="zh-CN")) -> dict[str, list[dict[str, str]]]:
    """List built-in situations (display metadata only)."""
    return {"situations": list_built_in_situations()}


@router.post("/situations/generate", response_model=GenerateSituationResponse)
async def generate_situation(request: GenerateSituationRequest) -> GenerateSituationResponse:
    """Generate a custom situation from a free-text user description."""
    try:
        cfg = await _generate_situation(
            seed_text=request.user_text,
            persona_id=request.persona_id,
            language=request.language,
            level=request.level,
            google_key=request.google_key,
            interface_language=request.interface_language,
        )
    except GenerationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return GenerateSituationResponse.from_config(cfg)


