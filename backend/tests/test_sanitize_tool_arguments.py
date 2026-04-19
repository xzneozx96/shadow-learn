"""Tests for _sanitize_tool_arguments — LLM tokenizer artifact cleanup.

Test cases are derived from real production logs (2026-04-09) where the
FPT AI model leaked <|\"|  tokens into tool call JSON arguments.
"""

import json

from app.agent.router import _sanitize_tool_arguments


# ------------------------------------------------------------------ #
# Real production log samples (verbatim from 2026-04-09 logs)
# ------------------------------------------------------------------ #


class TestRealLogSamples:
    """Cases copied directly from production error/warning logs."""

    def test_case_a_plain_strings_exercisetypes(self):
        """Log sample: exerciseTypes wrapped without extra quote (Case A)."""
        # Raw LLM output (actual characters — the backslash-quote is literal)
        raw = (
            '{"exerciseTypes": '
            '["<|\\"|cloze<|\\"|", "<|\\"|dictation<|\\"|", '
            '"<|\\"|translation<|\\"|", "<|\\"|pronunciation<|\\"|"], '
            '"itemIds": '
            '["<|\\"|"4b6893ea-0750-44af-b9e7-1fd5c8e50af5<|\\"|", '
            '"<|\\"|"8e22ec97-25e8-4b8e-8116-4707bf2799a7<|\\"|", '
            '"<|\\"|cc1d8d84-8806-4d0c-96a0-8c14a7301f34<|\\"|", '
            '"<|\\"|"d0420016-0fd0-445f-9bb6-ed5ac60f3d2a<|\\"|", '
            '"<|\\"|"0d831215-2892-4480-95be-6482a4c9b0f1<|\\"|", '
            '"<|\\"|"c7eb6664-b360-4311-9a4f-e4db223bc94c<|\\"|"], '
            '"sentencesPerWord": 2, "storyCount": 2}'
        )
        result = _sanitize_tool_arguments(raw)
        parsed = json.loads(result)
        assert parsed["exerciseTypes"] == [
            "cloze", "dictation", "translation", "pronunciation",
        ]
        assert parsed["itemIds"] == [
            "4b6893ea-0750-44af-b9e7-1fd5c8e50af5",
            "8e22ec97-25e8-4b8e-8116-4707bf2799a7",
            "cc1d8d84-8806-4d0c-96a0-8c14a7301f34",
            "d0420016-0fd0-445f-9bb6-ed5ac60f3d2a",
            "0d831215-2892-4480-95be-6482a4c9b0f1",
            "c7eb6664-b360-4311-9a4f-e4db223bc94c",
        ]
        assert parsed["sentencesPerWord"] == 2
        assert parsed["storyCount"] == 2

    def test_case_b_uuids_with_extra_quote(self):
        """Log sample 2: only itemIds + single exerciseType (Case B UUIDs)."""
        raw = (
            '{"itemIds": '
            '["<|\\"|"0d831215-2892-4480-95be-6482a4c9b0f1<|\\"|", '
            '"<|\\"|"c7eb6664-b360-4311-9a4f-e4db223bc94c<|\\"|", '
            '"<|\\"|"8e22ec97-25e8-4b8e-8116-4707bf2799a7<|\\"|", '
            '"<|\\"|"4b6893ea-0750-44af-b9e7-1fd5c8e50af5<|\\"|", '
            '"<|\\"|"a16b7704-58e7-40a1-9400-a6a2db67c957<|\\"|"], '
            '"exerciseTypes": ["<|\\"|cloze<|\\"|"], '
            '"storyCount": 5}'
        )
        result = _sanitize_tool_arguments(raw)
        parsed = json.loads(result)
        assert len(parsed["itemIds"]) == 5
        assert parsed["itemIds"][0] == "0d831215-2892-4480-95be-6482a4c9b0f1"
        assert parsed["exerciseTypes"] == ["cloze"]
        assert parsed["storyCount"] == 5


# ------------------------------------------------------------------ #
# Edge cases and robustness
# ------------------------------------------------------------------ #


class TestCleanJsonPassthrough:
    """Already-valid JSON must pass through unchanged."""

    def test_clean_json_unchanged(self):
        raw = '{"exerciseTypes": ["cloze"], "itemIds": ["abc-123"], "n": 1}'
        result = _sanitize_tool_arguments(raw)
        assert result == raw
        assert json.loads(result) == json.loads(raw)

    def test_empty_object(self):
        assert _sanitize_tool_arguments("{}") == "{}"

    def test_empty_string_returns_empty(self):
        assert _sanitize_tool_arguments("") == ""


class TestPartialArtifacts:
    """Tokens that only partially match observed patterns."""

    def test_mixed_case_a_and_b_in_same_array(self):
        """Some values have extra quote (Case B), some don't (Case A)."""
        raw = (
            '["<|\\"|cloze<|\\"|", "<|\\"|"uuid-1<|\\"|"]'
        )
        result = _sanitize_tool_arguments(raw)
        parsed = json.loads(result)
        assert parsed == ["cloze", "uuid-1"]

    def test_single_wrapped_value(self):
        """A lone string value wrapped in tokens."""
        raw = '"<|\\"|hello<|\\"|"'
        result = _sanitize_tool_arguments(raw)
        assert json.loads(result) == "hello"

    def test_single_wrapped_uuid(self):
        raw = '"<|\\"|"550e8400-e29b-41d4-a716-446655440000<|\\"|"'
        result = _sanitize_tool_arguments(raw)
        assert json.loads(result) == "550e8400-e29b-41d4-a716-446655440000"

    def test_nested_object_values(self):
        """Tokens inside nested object string values."""
        raw = '{"a": {"b": "<|\\"|nested<|\\"|"}}'
        result = _sanitize_tool_arguments(raw)
        parsed = json.loads(result)
        assert parsed["a"]["b"] == "nested"


class TestFallbackBehavior:
    """When sanitization cannot produce valid JSON, return raw."""

    def test_unsalvageable_returns_raw(self):
        """Completely garbled input should come back unchanged."""
        raw = '{this is not json at all <|"| ???'
        result = _sanitize_tool_arguments(raw)
        assert result == raw

    def test_partial_token_no_closing(self):
        """Opening token with no closing pair — should not corrupt further."""
        raw = '{"key": "<|\\"|value_no_close"}'
        result = _sanitize_tool_arguments(raw)
        # Either it cleans up to valid JSON or falls back to raw
        try:
            json.loads(result)
        except json.JSONDecodeError:
            assert result == raw, (
                "If sanitization can't fix it, must return raw for the caller's error path"
            )


class TestNoNumericCorruption:
    """Non-string JSON values must not be affected."""

    def test_integers_preserved(self):
        raw = (
            '{"exerciseTypes": ["<|\\"|cloze<|\\"|"], '
            '"sentencesPerWord": 2, "storyCount": 5}'
        )
        result = _sanitize_tool_arguments(raw)
        parsed = json.loads(result)
        assert parsed["sentencesPerWord"] == 2
        assert parsed["storyCount"] == 5

    def test_booleans_and_null_preserved(self):
        raw = '{"flag": true, "name": "<|\\"|test<|\\"|", "other": null}'
        result = _sanitize_tool_arguments(raw)
        parsed = json.loads(result)
        assert parsed["flag"] is True
        assert parsed["name"] == "test"
        assert parsed["other"] is None
