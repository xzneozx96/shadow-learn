import json
import logging
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.settings import settings
from app.shared.utils import _resolve_key
from app.shared._retry import RetryableError, http_retry

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/daily-review", tags=["daily-review"])


class WordInput(BaseModel):
    hanzi: str
    pinyin: str
    meaning: str


class PassageRequest(BaseModel):
    openrouter_api_key: str | None = None
    words: list[WordInput]
    source_language: str = "zh-CN"  # accepted for API consistency; endpoints are Chinese-only


class PassageResponse(BaseModel):
    passage: str
    pinyin: str


class GradePassageRequest(BaseModel):
    openrouter_api_key: str | None = None
    passage: str
    user_translation: str
    source_language: str = "zh-CN"  # accepted for API consistency; endpoints are Chinese-only


class GradePassageResponse(BaseModel):
    score: Literal["excellent", "good", "needs-work"]
    feedback: str


class GradeSentenceRequest(BaseModel):
    openrouter_api_key: str | None = None
    hanzi: str
    meaning: str
    user_sentence: str


class GradeSentenceResponse(BaseModel):
    correct: bool
    feedback: str


_PASSAGE_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "passage_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "passage": {"type": "string"},
                "pinyin": {"type": "string"},
            },
            "required": ["passage", "pinyin"],
            "additionalProperties": False,
        },
    },
}

_GRADE_PASSAGE_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "grade_passage_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "score": {"type": "string", "enum": ["excellent", "good", "needs-work"]},
                "feedback": {"type": "string"},
            },
            "required": ["score", "feedback"],
            "additionalProperties": False,
        },
    },
}

_GRADE_SENTENCE_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "grade_sentence_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "correct": {"type": "boolean"},
                "feedback": {"type": "string"},
            },
            "required": ["correct", "feedback"],
            "additionalProperties": False,
        },
    },
}


async def _call_openrouter(api_key: str, messages: list[dict], response_format: dict) -> dict:
    payload = {
        "model": settings.openrouter_structured_model,
        "messages": messages,
        "temperature": 0.5,
        "response_format": response_format,
        "reasoning": {"effort": "none"},
    }

    @http_retry(logger)
    async def _call() -> dict:
        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(
                settings.openrouter_chat_url,
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )
        resp.raise_for_status()
        body = resp.json()
        if "error" in body or "choices" not in body:
            logger.error("[daily-review] OpenRouter unexpected response: %s", body)
            raise HTTPException(500, f"OpenRouter error: {body.get('error', body)}")
        choice = body["choices"][0]
        if choice.get("finish_reason") == "length":
            raise RetryableError("response truncated by token limit")
        try:
            return json.loads(choice["message"]["content"])
        except json.JSONDecodeError as exc:
            raise RetryableError(f"malformed JSON: {exc}") from exc

    return await _call()


@router.post("/passage", response_model=PassageResponse)
async def generate_passage(req: PassageRequest):
    api_key = _resolve_key(req.openrouter_api_key, settings.openrouter_api_key, "OpenRouter API key")
    word_list = ", ".join(f"{w.hanzi} ({w.meaning})" for w in req.words)
    messages = [
        {"role": "system", "content": "You are a Chinese teacher creating reading passages for Vietnamese learners."},
        {"role": "user", "content": (
            f"Write a short Chinese story or dialogue (8–12 sentences) naturally incorporating these words: {word_list}. "
            "Level: HSK 3–4. The story should feel natural, not a vocabulary list. "
            "Return JSON with fields: passage (the Chinese text) and pinyin (full pinyin of the passage, one pinyin string matching the passage)."
        )},
    ]
    result = await _call_openrouter(api_key, messages, _PASSAGE_JSON_SCHEMA)
    return PassageResponse(**result)


@router.post("/grade-passage", response_model=GradePassageResponse)
async def grade_passage(req: GradePassageRequest):
    api_key = _resolve_key(req.openrouter_api_key, settings.openrouter_api_key, "OpenRouter API key")
    messages = [
        {"role": "system", "content": "You are a Chinese teacher grading a Vietnamese learner's translation."},
        {"role": "user", "content": (
            f"Original Chinese passage:\n{req.passage}\n\n"
            f"Learner's Vietnamese translation:\n{req.user_translation}\n\n"
            "Grade holistically: did the learner convey the overall meaning accurately? "
            "Return JSON: score ('excellent', 'good', or 'needs-work') and feedback (2–3 sentences in Vietnamese)."
        )},
    ]
    result = await _call_openrouter(api_key, messages, _GRADE_PASSAGE_JSON_SCHEMA)
    return GradePassageResponse(**result)


@router.post("/grade-sentence", response_model=GradeSentenceResponse)
async def grade_sentence(req: GradeSentenceRequest):
    api_key = _resolve_key(req.openrouter_api_key, settings.openrouter_api_key, "OpenRouter API key")
    messages = [
        {"role": "system", "content": "You are a Chinese teacher grading a Vietnamese learner's sentence."},
        {"role": "user", "content": (
            f"Word: {req.hanzi} — meaning: {req.meaning}\n"
            f"Learner's sentence: {req.user_sentence}\n\n"
            "Does the learner use the word correctly in context? "
            "Return JSON: correct (boolean) and feedback (1–2 sentences in Vietnamese)."
        )},
    ]
    result = await _call_openrouter(api_key, messages, _GRADE_SENTENCE_JSON_SCHEMA)
    return GradeSentenceResponse(**result)
