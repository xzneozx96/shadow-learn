"""Romaji generation service using pykakasi."""

import pykakasi

_kakasi = pykakasi.kakasi()


def generate_romaji(japanese_text: str) -> str:
    """Convert Japanese text to Hepburn romaji.

    Returns a space-joined string of romaji syllables. Non-Japanese characters
    (punctuation, digits, etc.) are preserved as-is in the output.
    """
    if not japanese_text:
        return ""
    result = _kakasi.convert(japanese_text)
    return " ".join(item["hepburn"] for item in result if item["hepburn"])
