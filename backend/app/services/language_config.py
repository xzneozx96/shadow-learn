"""Language configuration for pipeline prompts and romanization."""

_LANGUAGE_CONFIG: dict[str, dict] = {
    "zh-CN": {
        "language_name": "Chinese (Mandarin)",
        "romanization_label": "Pinyin",
        "romanization_description": 'pinyin with tone marks (e.g. "zhōng wén")',
    },
    "zh-TW": {
        "language_name": "Chinese (Traditional)",
        "romanization_label": "Pinyin",
        "romanization_description": 'pinyin with tone marks (e.g. "zhōng wén")',
    },
    "en": {
        "language_name": "English",
        "romanization_label": "IPA",
        "romanization_description": "IPA transcription (e.g. /həˈloʊ/)",
    },
    "ja": {
        "language_name": "Japanese",
        "romanization_label": "Romaji",
        "romanization_description": 'romaji romanization (e.g. "konnichiwa")',
    },
    "ko": {
        "language_name": "Korean",
        "romanization_label": "",
        "romanization_description": "leave empty string — no standard romanization",
    },
    "vi": {
        "language_name": "Vietnamese",
        "romanization_label": "",
        "romanization_description": "leave empty string — no standard romanization",
    },
}


def get_language_config(source_language: str) -> dict:
    """Return language config for source_language; falls back to zh-CN for unknown codes."""
    return (
        _LANGUAGE_CONFIG.get(source_language)
        or _LANGUAGE_CONFIG.get(source_language.split("-")[0])
        or _LANGUAGE_CONFIG["zh-CN"]
    )
