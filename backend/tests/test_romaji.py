from app.lessons.services.romaji import generate_romaji


def test_generate_romaji_basic():
    result = generate_romaji("日本語")
    assert isinstance(result, str) and result
    assert "nihongo" in result.lower().replace(" ", "")


def test_generate_romaji_hiragana():
    result = generate_romaji("こんにちは")
    assert isinstance(result, str) and result


def test_generate_romaji_mixed():
    result = generate_romaji("東京タワー")
    assert isinstance(result, str) and result


def test_generate_romaji_empty():
    assert generate_romaji("") == ""


def test_generate_romaji_punctuation():
    result = generate_romaji("こんにちは！")
    assert isinstance(result, str) and result


def test_generate_romaji_katakana():
    result = generate_romaji("アニメ")
    assert isinstance(result, str) and result
