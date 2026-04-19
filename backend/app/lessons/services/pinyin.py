"""Pinyin generation service using pypinyin."""

from pypinyin import pinyin, Style


def generate_pinyin(chinese_text: str) -> str:
    """Convert Chinese text to pinyin with tone marks.

    Returns a space-joined string of pinyin syllables. Non-Chinese characters
    (punctuation, digits, etc.) are preserved as-is in the output.
    """
    if not chinese_text:
        return ""
    result = pinyin(chinese_text, style=Style.TONE, heteronym=False)
    return " ".join(item[0] for item in result)
