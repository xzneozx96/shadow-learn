import json
import logging
import time

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/translation", tags=["translation"])


class GenerateRequest(BaseModel):
    openrouter_api_key: str
    word: str
    pinyin: str
    meaning: str
    usage: str = ""
    sentence_count: int = 3


class SentencePair(BaseModel):
    chinese: str
    english: str


class GenerateResponse(BaseModel):
    sentences: list[SentencePair]


_GENERATE_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "translation_sentences",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "sentences": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "chinese": {"type": "string"},
                            "english": {"type": "string"},
                        },
                        "required": ["chinese", "english"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["sentences"],
            "additionalProperties": False,
        },
    },
}


def _build_generate_prompt(req: GenerateRequest) -> str:
    usage_line = f"\nExample usage from lesson: {req.usage}" if req.usage else ""
    return (
        f"Generate {req.sentence_count} short, natural Chinese sentences using the word "
        f"'{req.word}' ({req.pinyin}: {req.meaning}).{usage_line}\n\n"
        "Rules:\n"
        "- Each sentence must naturally include the target word.\n"
        "- Keep sentences simple and clear, suitable for HSK 2–3 level learners.\n"
        "- Provide an accurate English translation for each sentence.\n"
        "- Vary the sentence structures across examples."
    )


@router.post("/generate", response_model=GenerateResponse)
async def generate_sentences(req: GenerateRequest):
    prompt = _build_generate_prompt(req)
    payload = {
        "model": settings.openrouter_model,
        "messages": [
            {"role": "system", "content": "You are a Mandarin Chinese teacher creating translation exercises."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "response_format": _GENERATE_SCHEMA,
        "reasoning": {"effort": "none"},
    }

    logger.info("[translation] generate: word=%s sentence_count=%d", req.word, req.sentence_count)

    t0 = time.monotonic()
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            settings.openrouter_chat_url,
            headers={"Authorization": f"Bearer {req.openrouter_api_key}"},
            json=payload,
        )
        resp.raise_for_status()
    elapsed = time.monotonic() - t0
    logger.info("[translation] generate done: %.2fs", elapsed)

    content = resp.json()["choices"][0]["message"]["content"]
    data = json.loads(content)
    return GenerateResponse(**data)


class EvaluateRequest(BaseModel):
    openrouter_api_key: str
    source: str
    source_language: str    # e.g. 'chinese', 'english', 'japanese'
    target_language: str
    reference: str
    user_answer: str


class CategoryFeedback(BaseModel):
    score: int
    comment: str


class EvaluateResponse(BaseModel):
    overall_score: int
    accuracy: CategoryFeedback
    grammar: CategoryFeedback
    naturalness: CategoryFeedback
    tip: str


_EVALUATE_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "translation_evaluation",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "overall_score": {"type": "integer"},
                "accuracy": {
                    "type": "object",
                    "properties": {
                        "score": {"type": "integer"},
                        "comment": {"type": "string"},
                    },
                    "required": ["score", "comment"],
                    "additionalProperties": False,
                },
                "grammar": {
                    "type": "object",
                    "properties": {
                        "score": {"type": "integer"},
                        "comment": {"type": "string"},
                    },
                    "required": ["score", "comment"],
                    "additionalProperties": False,
                },
                "naturalness": {
                    "type": "object",
                    "properties": {
                        "score": {"type": "integer"},
                        "comment": {"type": "string"},
                    },
                    "required": ["score", "comment"],
                    "additionalProperties": False,
                },
                "tip": {"type": "string"},
            },
            "required": ["overall_score", "accuracy", "grammar", "naturalness", "tip"],
            "additionalProperties": False,
        },
    },
}


def _build_evaluate_prompt(req: EvaluateRequest) -> str:
    return (
        f"Evaluate this translation from {req.source_language} to {req.target_language}.\n\n"
        f"Source: {req.source}\n"
        f"Reference translation: {req.reference}\n"
        f"Learner's answer: {req.user_answer}\n\n"
        "Score each category 0–100 (integers only):\n"
        "- accuracy: Does the answer convey the same meaning as the source?\n"
        "- grammar: Is the target language grammar correct?\n"
        "- naturalness: Does it sound like something a native speaker would say?\n"
        "- overall_score: Holistic score consistent with the three category scores.\n"
        "- tip: One concise, actionable suggestion to improve the translation.\n\n"
        "Be constructive. A score of 60–79 means the answer is acceptable but has room for improvement."
    )


@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate_translation(req: EvaluateRequest):
    prompt = _build_evaluate_prompt(req)
    payload = {
        "model": settings.openrouter_model,
        "messages": [
            {"role": "system", "content": "You are a language teacher evaluating student translations."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.3,
        "response_format": _EVALUATE_SCHEMA,
        "reasoning": {"effort": "none"},
    }

    logger.info(
        "[translation] evaluate: src_lang=%s tgt_lang=%s",
        req.source_language, req.target_language,
    )

    t0 = time.monotonic()
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            settings.openrouter_chat_url,
            headers={"Authorization": f"Bearer {req.openrouter_api_key}"},
            json=payload,
        )
        resp.raise_for_status()
    elapsed = time.monotonic() - t0
    logger.info("[translation] evaluate done: %.2fs", elapsed)

    content = resp.json()["choices"][0]["message"]["content"]
    data = json.loads(content)
    return EvaluateResponse(**data)
