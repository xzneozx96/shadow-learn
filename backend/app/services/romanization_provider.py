"""Pluggable romanization providers — one per language family."""

from typing import Protocol


class RomanizationProvider(Protocol):
    def romanize_text(self, text: str) -> str: ...
    def romanize_word(self, word: str) -> str: ...


class ChineseRomanizationProvider:
    def romanize_text(self, text: str) -> str:
        from app.services.pinyin import generate_pinyin
        return generate_pinyin(text)

    def romanize_word(self, word: str) -> str:
        from app.services.pinyin import generate_pinyin
        return generate_pinyin(word)


class EnglishRomanizationProvider:
    def romanize_text(self, text: str) -> str:
        import eng_to_ipa  # type: ignore[import]
        return eng_to_ipa.convert(text)

    def romanize_word(self, word: str) -> str:
        import eng_to_ipa  # type: ignore[import]
        return eng_to_ipa.convert(word)


class NullRomanizationProvider:
    def romanize_text(self, text: str) -> str:
        return ""

    def romanize_word(self, word: str) -> str:
        return ""


def get_romanization_provider(source_language: str) -> RomanizationProvider:
    """Return the appropriate romanization provider for source_language."""
    if source_language.startswith("zh"):
        return ChineseRomanizationProvider()
    if source_language.startswith("en"):
        return EnglishRomanizationProvider()
    return NullRomanizationProvider()
