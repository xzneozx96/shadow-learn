"""Pydantic schemas for /api/tips/studio/{kind} request and response payloads."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

StudioLocale = Literal["en", "vi"]
StudioKind = Literal["summary", "study_guide", "cards"]


class StudioRequest(BaseModel):
    video_id: str = Field(min_length=6, max_length=32)
    transcript: str = Field(min_length=1)
    locale: StudioLocale


class StudioSummary(BaseModel):
    abstract: str = Field(min_length=1, max_length=600)
    takeaways: list[str] = Field(min_length=3, max_length=6)


class StudyGuideItem(BaseModel):
    question: str = Field(min_length=1)
    answer: str = Field(min_length=1)


class StudioStudyGuide(BaseModel):
    items: list[StudyGuideItem] = Field(min_length=3, max_length=10)


class ConceptCard(BaseModel):
    id: str = Field(min_length=1)
    front: str = Field(min_length=1, max_length=200)
    rule: str = Field(min_length=1, max_length=400)
    example: str = Field(min_length=1, max_length=200)
    trap: str | None = Field(default=None, max_length=200)


class StudioCards(BaseModel):
    cards: list[ConceptCard] = Field(min_length=1, max_length=8)
