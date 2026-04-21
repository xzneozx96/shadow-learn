from app.speak.culture import CULTURE_CONTEXT, get_culture_context


def test_culture_context_covers_all_supported_languages():
    for lang in ("zh-CN", "zh-TW", "en", "ja", "ko", "vi"):
        assert lang in CULTURE_CONTEXT
        assert len(CULTURE_CONTEXT[lang]) > 20


def test_japanese_context_mentions_keigo():
    assert "keigo" in CULTURE_CONTEXT["ja"].lower()


def test_chinese_mainland_context_mentions_direct_warmth():
    assert "direct" in CULTURE_CONTEXT["zh-CN"].lower()


def test_get_culture_context_falls_back_to_english():
    assert get_culture_context("xx") == CULTURE_CONTEXT["en"]
