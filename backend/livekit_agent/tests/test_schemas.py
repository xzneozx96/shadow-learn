"""Tests for pydantic schemas used by offshore Gemini proxy."""
import os
import sys

import pytest
from pydantic import ValidationError

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from schemas import (
    GeminiAPIResponse,
    GenerateContentRequest,
    GenerateContentResponse,
    GenerationConfig,
)


class TestGenerationConfig:
    def test_defaults_match_existing_call_llm(self):
        cfg = GenerationConfig()
        assert cfg.response_mime_type == "application/json"
        assert cfg.temperature == pytest.approx(0.7)
        assert cfg.max_output_tokens == 800

    def test_serializes_with_camel_case_for_google(self):
        cfg = GenerationConfig()
        body = cfg.model_dump(by_alias=True)
        assert "responseMimeType" in body
        assert "maxOutputTokens" in body
        assert body["temperature"] == pytest.approx(0.7)


class TestGenerateContentRequest:
    def test_accepts_valid_input(self):
        req = GenerateContentRequest(prompt="hi", google_key="k")
        assert req.prompt == "hi"
        assert req.google_key == "k"
        assert req.generation_config.max_output_tokens == 800

    def test_rejects_empty_prompt(self):
        with pytest.raises(ValidationError):
            GenerateContentRequest(prompt="", google_key="k")

    def test_rejects_empty_google_key(self):
        with pytest.raises(ValidationError):
            GenerateContentRequest(prompt="hi", google_key="")

    def test_accepts_overridden_config(self):
        req = GenerateContentRequest(
            prompt="hi",
            google_key="k",
            generation_config=GenerationConfig(temperature=0.2, max_output_tokens=100),
        )
        assert req.generation_config.temperature == pytest.approx(0.2)


class TestGenerateContentResponse:
    def test_holds_text(self):
        resp = GenerateContentResponse(text='{"x": 1}')
        assert resp.text == '{"x": 1}'

    def test_rejects_missing_text(self):
        with pytest.raises(ValidationError):
            GenerateContentResponse()  # type: ignore[call-arg]


class TestGeminiAPIResponse:
    def test_parses_canonical_success(self):
        raw = {
            "candidates": [
                {"content": {"parts": [{"text": "hello"}]}}
            ]
        }
        parsed = GeminiAPIResponse.model_validate(raw)
        assert parsed.first_text() == "hello"

    def test_rejects_missing_candidates(self):
        with pytest.raises(ValidationError):
            GeminiAPIResponse.model_validate({})

    def test_rejects_empty_candidates_via_first_text(self):
        # Pydantic accepts empty list, but extracting must raise so retry triggers.
        parsed = GeminiAPIResponse.model_validate({"candidates": []})
        with pytest.raises(ValueError):
            parsed.first_text()

    def test_rejects_missing_parts(self):
        raw = {"candidates": [{"content": {"parts": []}}]}
        parsed = GeminiAPIResponse.model_validate(raw)
        with pytest.raises(ValueError):
            parsed.first_text()
