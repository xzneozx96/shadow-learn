"""Per-language cultural context used during system prompt construction."""

CULTURE_CONTEXT: dict[str, str] = {
    "zh-CN": (
        "Mainland Chinese social norms: direct warmth, call out 服务员 to servers, "
        "family-style sharing, casual bill request with 买单. No tipping. "
        "Addressing strangers with 师傅, 阿姨, 大哥 by context."
    ),
    "zh-TW": (
        "Taiwanese norms: polite but warm, slightly softer tone than mainland. "
        "Traditional characters. Use 不好意思 readily, say 謝謝 often. No tipping."
    ),
    "en": (
        "Casual American English norms unless the scene implies a more formal register. "
        "First-name basis with peers; 'sir/ma'am' only in service contexts. "
        "Tipping expected in restaurants and service."
    ),
    "ja": (
        "Japanese norms: reserved tone, polite keigo (です/ます) by default, "
        "individual ordering, bow-and-thank (ありがとうございます). "
        "Tipping is considered rude. Silence is acceptable."
    ),
    "ko": (
        "Korean norms: age and status hierarchy matter. Use -요 polite form by default, "
        "switch to -습니다 formal form in business contexts. Bow when greeting. No tipping."
    ),
    "vi": (
        "Vietnamese norms: pronoun choice depends on age/relationship "
        "(anh/chị/em/cô/chú). Neutral polite register by default. "
        "Soft tipping optional in upscale venues."
    ),
}

_FALLBACK_LANGUAGE = "en"


def get_culture_context(language: str) -> str:
    """Return cultural context for a language; falls back to English."""
    return CULTURE_CONTEXT.get(language) or CULTURE_CONTEXT[_FALLBACK_LANGUAGE]
