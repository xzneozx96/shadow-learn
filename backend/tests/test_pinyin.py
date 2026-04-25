from app.lessons.services.pinyin import generate_pinyin


def test_generate_pinyin_basic():
    """'你好世界' contains nǐ and hǎo."""
    result = generate_pinyin("你好世界")
    assert "nǐ" in result
    assert "hǎo" in result


def test_generate_pinyin_sentence():
    """'今天是星期四' contains jīn."""
    result = generate_pinyin("今天是星期四")
    assert "jīn" in result


def test_generate_pinyin_empty():
    """Empty string returns empty string."""
    result = generate_pinyin("")
    assert result == ""


def test_generate_pinyin_with_punctuation():
    """'你好！' preserves ！ in output."""
    result = generate_pinyin("你好！")
    assert "！" in result
