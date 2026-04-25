"""Pydantic models for the China<->offshore proxy contract.

Mirrors `backend/livekit_agent/schemas.py`. Duplicated to keep the China
backend independent of the livekit_agent package import path.

IMPORTANT: Keep in sync with `backend/livekit_agent/schemas.py`.
Any change to GenerateContentRequest, GenerateContentResponse, or
GenerationConfig defaults must be applied to BOTH files.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class GenerationConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    response_mime_type: str = Field(default="application/json", alias="responseMimeType")
    temperature: float = 0.7
    max_output_tokens: int = Field(default=800, alias="maxOutputTokens")


class GenerateContentRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    google_key: str = Field(..., min_length=1)
    generation_config: GenerationConfig = Field(default_factory=GenerationConfig)


class GenerateContentResponse(BaseModel):
    text: str
