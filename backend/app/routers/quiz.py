# backend/app/routers/quiz.py
import json
import re

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.services.language_config import get_language_config

router = APIRouter(prefix="/api/quiz", tags=["quiz"])


class WordInput(BaseModel):
    word: str
    romanization: str
    meaning: str
    usage: str


class QuizRequest(BaseModel):
    openrouter_api_key: str
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


class QuizResponse(BaseModel):
    exercises: list[ClozeExercise | PronunciationExercise]


def _build_cloze_prompt(words: list[WordInput], story_count: int, lang_cfg: dict) -> str:
    word_list = "\n".join(f"- {w.word} ({w.romanization}): {w.meaning}" for w in words[:5])
    return (
        f"Generate {story_count} short cohesive {lang_cfg['language_name']} story(ies) using these vocabulary words:\n"
        f"{word_list}\n\n"
        "Rules:\n"
        "- Each story should be 2-3 sentences, using up to 5 of these words naturally.\n"
        "- Mark each vocabulary word occurrence with {{word}}, e.g. {{今天}}.\n"
        '- Return JSON: {"exercises": [{"story": "...", "blanks": ["word1", "word2"]}]}\n'
        "- Only return valid JSON, no markdown fences."
    )


def _build_pronunciation_prompt(words: list[WordInput], count: int, lang_cfg: dict) -> str:
    word_list = "\n".join(f"- {w.word} ({w.romanization}): {w.meaning}" for w in words)
    return (
        f"Generate {count} short, natural {lang_cfg['language_name']} sentences for pronunciation practice "
        f"using these vocabulary words:\n{word_list}\n\n"
        "Rules:\n"
        "- Each sentence should incorporate at least one vocabulary word.\n"
        "- Include an English translation for each sentence.\n"
        '- Return JSON: {"exercises": [{"sentence": "中文", "translation": "English"}]}\n'
        "- Only return valid JSON, no markdown fences."
    )


@router.post("/generate", response_model=QuizResponse)
async def generate_quiz(req: QuizRequest):
    lang_cfg = get_language_config(req.source_language)

    if req.exercise_type == "cloze":
        prompt = _build_cloze_prompt(req.words, req.story_count, lang_cfg)
    elif req.exercise_type == "pronunciation_sentence":
        prompt = _build_pronunciation_prompt(req.words, req.count, lang_cfg)
    else:
        raise HTTPException(400, f"Unknown exercise_type: {req.exercise_type}")

    payload = {
        "model": "openai/gpt-4o-mini",
        "messages": [
            {"role": "system", "content": f"You are a {lang_cfg['language_name']} teacher creating learning exercises."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            settings.openai_chat_url,
            headers={"Authorization": f"Bearer {req.openrouter_api_key}"},
            json=payload,
        )
        resp.raise_for_status()

    content = resp.json()["choices"][0]["message"]["content"]
    # Strip any markdown fences just in case
    content = re.sub(r"```(?:json)?\s*|\s*```", "", content).strip()

    data = json.loads(content)
    return QuizResponse(**data)
