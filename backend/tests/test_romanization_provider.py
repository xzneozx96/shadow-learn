from app.services.romanization_provider import (
    ChineseRomanizationProvider,
    NullRomanizationProvider,
    get_romanization_provider,
)


def test_chinese_provider_returns_nonempty_string():
    p = ChineseRomanizationProvider()
    result = p.romanize_text("你好")
    assert isinstance(result, str) and result


def test_null_provider_returns_empty_string():
    p = NullRomanizationProvider()
    assert p.romanize_text("anything") == ""
    assert p.romanize_word("hello") == ""


def test_english_provider_returns_nonempty_for_simple_word():
    """Smoke test: confirms eng-to-ipa installed correctly."""
    from app.services.romanization_provider import EnglishRomanizationProvider
    p = EnglishRomanizationProvider()
    result = p.romanize_word("hello")
    assert isinstance(result, str) and result


def test_get_romanization_provider_chinese():
    from app.services.romanization_provider import ChineseRomanizationProvider
    assert isinstance(get_romanization_provider("zh-CN"), ChineseRomanizationProvider)
    assert isinstance(get_romanization_provider("zh-TW"), ChineseRomanizationProvider)


def test_get_romanization_provider_fallback_to_null():
    from app.services.romanization_provider import NullRomanizationProvider
    assert isinstance(get_romanization_provider("ko"), NullRomanizationProvider)
    assert isinstance(get_romanization_provider("vi"), NullRomanizationProvider)


def test_japanese_provider_returns_nonempty_string():
    from app.services.romanization_provider import JapaneseRomanizationProvider
    p = JapaneseRomanizationProvider()
    result = p.romanize_text("日本語")
    assert isinstance(result, str) and result


def test_japanese_provider_romanize_word():
    from app.services.romanization_provider import JapaneseRomanizationProvider
    p = JapaneseRomanizationProvider()
    result = p.romanize_word("東京")
    assert isinstance(result, str) and result


def test_get_romanization_provider_japanese():
    from app.services.romanization_provider import JapaneseRomanizationProvider
    assert isinstance(get_romanization_provider("ja"), JapaneseRomanizationProvider)
    assert isinstance(get_romanization_provider("ja-JP"), JapaneseRomanizationProvider)


def test_get_language_config_fallback():
    from app.services.language_config import get_language_config
    cfg = get_language_config("zh-CN")
    assert cfg["language_name"] == "Chinese (Mandarin)"
    # Unknown language falls back to zh-CN
    fallback = get_language_config("xx-UNKNOWN")
    assert fallback["language_name"] == "Chinese (Mandarin)"
