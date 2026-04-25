"""Pydantic schemas for offshore Gemini proxy.

IMPORTANT: GenerateContentRequest, GenerateContentResponse, and GenerationConfig
are duplicated in `backend/app/speak/_schemas_gemini.py` (China side). Any change
to defaults or field names must be applied to BOTH files.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class GenerationConfig(BaseModel):
    """Mirrors Google's GenerationConfig. Defaults match the values used by
    the original `_call_llm` body in `app/speak/generation.py`.
    """

    model_config = ConfigDict(populate_by_name=True)

    response_mime_type: str = Field(default="application/json", alias="responseMimeType")
    temperature: float = 0.7
    max_output_tokens: int = Field(default=800, alias="maxOutputTokens")


class GenerateContentRequest(BaseModel):
    """Request body sent from China backend to offshore /internal/gemini/generate-content."""

    prompt: str = Field(..., min_length=1)
    google_key: str = Field(..., min_length=1)
    generation_config: GenerationConfig = Field(default_factory=GenerationConfig)


class GenerateContentResponse(BaseModel):
    """Response body returned by offshore back to China backend."""

    text: str


class _GeminiPart(BaseModel):
    text: str


class _GeminiContent(BaseModel):
    parts: list[_GeminiPart] = Field(default_factory=list)


class _GeminiCandidate(BaseModel):
    content: _GeminiContent


class GeminiAPIResponse(BaseModel):
    """Typed wrapper for Google's generateContent REST response."""

    candidates: list[_GeminiCandidate]

    def first_text(self) -> str:
        """Extract the first candidate's first part text. Raises ValueError
        when the response has no usable text so the retry layer triggers."""
        if not self.candidates:
            raise ValueError("no candidates in Gemini response")
        parts = self.candidates[0].content.parts
        if not parts:
            raise ValueError("no parts in Gemini candidate content")
        return parts[0].text
