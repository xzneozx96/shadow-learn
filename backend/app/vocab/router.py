"""Vocab breakdown story endpoint.

Single non-streaming OpenRouter call. Returns plain text story given
pre-validated structural facts. Frontend supplies all radical / Sino-Vietnamese
data — the LLM never invents structural facts.
"""

import logging

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.settings import settings
from app.shared.utils import _resolve_key
from app.shared._retry import RetryableError, http_retry
from app.vocab.prompt import (
    SYSTEM_PROMPT,
    CharPromptInput,
    build_story_prompt,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/vocab", tags=["vocab"])


class BreakdownStoryRequest(BaseModel):
    word: str = Field(..., min_length=1, max_length=16)
    pinyin: str = Field("", max_length=64)
    meaning: str = Field("", max_length=500)
    sino_vietnamese: str = Field("", max_length=80)
    characters: list[CharPromptInput] = Field(..., min_length=1, max_length=16)
    openrouter_api_key: str | None = Field(None, max_length=200)


class BreakdownStoryResponse(BaseModel):
    story: str


@router.post("/breakdown-story", response_model=BreakdownStoryResponse)
async def generate_breakdown_story(req: BreakdownStoryRequest) -> BreakdownStoryResponse:
    api_key = _resolve_key(
        req.openrouter_api_key, settings.openrouter_api_key, "OpenRouter API key"
    )

    user_prompt = build_story_prompt(
        word=req.word,
        pinyin=req.pinyin,
        meaning=req.meaning,
        sino_vietnamese=req.sino_vietnamese,
        characters=req.characters,
    )

    payload = {
        "model": settings.openrouter_agent_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 512,
        "reasoning": {"effort": "none"},
    }

    logger.info("[vocab] breakdown-story: word=%s chars=%d", req.word, len(req.characters))

    @http_retry(logger)
    async def _call() -> str:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                settings.openrouter_chat_url,
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )
        if resp.status_code >= 500:
            raise RetryableError(f"OpenRouter {resp.status_code}")
        resp.raise_for_status()
        body = resp.json()
        if "error" in body or "choices" not in body:
            logger.error("[vocab] breakdown-story unexpected response: %s", body)
            raise HTTPException(500, f"OpenRouter error: {body.get('error', body)}")
        story = body["choices"][0]["message"]["content"].strip()
        if not story:
            raise RetryableError("empty story")
        return story

    try:
        story = await _call()
    except RetryableError as exc:
        raise HTTPException(502, f"OpenRouter error: {exc}") from exc

    return BreakdownStoryResponse(story=story)
