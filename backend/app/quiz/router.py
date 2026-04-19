# backend/app/routers/quiz.py
import json
import logging

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.settings import settings
from app.shared.utils import _resolve_key
from app.shared._retry import RetryableError, openrouter_retry
from app.shared.language_config import get_language_config

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/quiz", tags=["quiz"])


class WordInput(BaseModel):
    word: str
    romanization: str
    meaning: str
    usage: str


class QuizRequest(BaseModel):
    openrouter_api_key: str | None = None
    words: list[WordInput]
    exercise_type: str  # "cloze" | "pronunciation_sentence"
    story_count: int = 1
    count: int = 5
    source_language: str = "zh-CN"


class ClozeExercise(BaseModel):
    story: str
    blanks: list[str]


class PronunciationExercise(BaseModel):
    sentence: str
    translation: str
    romanization: str


class QuizResponse(BaseModel):
    exercises: list[ClozeExercise | PronunciationExercise]


_CLOZE_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "cloze_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "exercises": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "story": {"type": "string"},
                            "blanks": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["story", "blanks"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["exercises"],
            "additionalProperties": False,
        },
    },
}

_PRONUNCIATION_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "pronunciation_exercises",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "exercises": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "sentence": {"type": "string"},
                            "translation": {"type": "string"},
                            "romanization": {"type": "string"},
                        },
                        "required": ["sentence", "translation", "romanization"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["exercises"],
            "additionalProperties": False,
        },
    },
}


def _build_cloze_prompt(words: list[WordInput], story_count: int, lang_cfg: dict) -> str:
    word_list = "\n".join(f"- {w.word} ({w.romanization}): {w.meaning}" for w in words[:5])
    return (
        f"Generate {story_count} short cohesive {lang_cfg['language_name']} story(ies) using these vocabulary words:\n"
        f"{word_list}\n\n"
        "Rules:\n"
        "- Each story should be 2-3 sentences, using up to 5 of these words naturally.\n"
        "- Mark each vocabulary word occurrence with {{word}}, e.g. {{今天}}.\n"
        "- The blanks array must list each marked vocabulary word in order of appearance.\n\n"
        'Return JSON: {"exercises": [{"story": "<str>", "blanks": ["<str>"]}]}'
    )


def _build_pronunciation_prompt(words: list[WordInput], count: int, lang_cfg: dict) -> str:
    word_list = "\n".join(f"- {w.word} ({w.romanization}): {w.meaning}" for w in words)
    return (
        f"Generate {count} short, natural {lang_cfg['language_name']} sentences for pronunciation practice "
        f"using these vocabulary words:\n{word_list}\n\n"
        "Rules:\n"
        "- Each sentence should incorporate at least one vocabulary word.\n"
        "- Include an English translation for each sentence.\n"
        "- Include a romanization (e.g. pinyin with tone marks for Chinese) for each sentence.\n\n"
        'Return JSON: {"exercises": [{"sentence": "<str>", "translation": "<str>", "romanization": "<str>"}]}'
    )


@router.post("/generate", response_model=QuizResponse)
async def generate_quiz(req: QuizRequest):
    lang_cfg = get_language_config(req.source_language)
    api_key = _resolve_key(req.openrouter_api_key, settings.openrouter_api_key, "OpenRouter API key")

    if req.exercise_type == "cloze":
        prompt = _build_cloze_prompt(req.words, req.story_count, lang_cfg)
    elif req.exercise_type == "pronunciation_sentence":
        prompt = _build_pronunciation_prompt(req.words, req.count, lang_cfg)
    else:
        raise HTTPException(400, f"Unknown exercise_type: {req.exercise_type}")

    logger.info(
        "[quiz] generate: type=%s story_count=%d count=%d words=%d",
        req.exercise_type, req.story_count, req.count, len(req.words),
    )

    response_format = _CLOZE_JSON_SCHEMA if req.exercise_type == "cloze" else _PRONUNCIATION_JSON_SCHEMA

    payload = {
        "model": settings.openrouter_structured_model,
        "messages": [
            {"role": "system", "content": f"You are a {lang_cfg['language_name']} teacher creating learning exercises."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "response_format": response_format,
        "reasoning": {"effort": "none"},
    }

    @openrouter_retry(logger)
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
            logger.error("[quiz] generate: unexpected response: %s", body)
            raise HTTPException(500, f"OpenRouter error: {body.get('error', body)}")
        choice = body["choices"][0]
        if choice.get("finish_reason") == "length":
            raise RetryableError("response truncated by token limit")
        try:
            return json.loads(choice["message"]["content"])
        except json.JSONDecodeError as exc:
            raise RetryableError(f"malformed JSON: {exc}") from exc

    data = await _call()
    return QuizResponse(**data)
