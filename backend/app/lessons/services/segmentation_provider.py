"""Pluggable word-segmentation providers — deterministic, one per language family."""

import re
from typing import Protocol

# A token is meaningful if it contains at least one word character. \w under
# Python's default Unicode matching covers CJK; fullwidth/halfwidth punctuation
# and whitespace do not — so this drops pure-punctuation tokens jieba emits.
_HAS_WORD_CHAR = re.compile(r"\w", re.UNICODE)


class SegmentationProvider(Protocol):
    def segment(self, text: str) -> list[str]: ...


class ChineseSegmentationProvider:
    def segment(self, text: str) -> list[str]:
        import jieba  # type: ignore[import]
        return [
            tok for tok in jieba.lcut(text)
            if _HAS_WORD_CHAR.search(tok)
        ]


def get_segmentation_provider(source_language: str) -> SegmentationProvider | None:
    """Return a deterministic segmenter for source_language, or None to fall back to LLM."""
    if source_language.startswith("zh"):
        return ChineseSegmentationProvider()
    return None
