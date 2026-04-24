from app.lessons.services.chinese_normalizer import normalize_chinese


def test_traditional_converts_to_simplified():
    assert normalize_chinese("這是繁體中文") == "这是繁体中文"


def test_already_simplified_passthrough():
    assert normalize_chinese("这是简体中文") == "这是简体中文"


def test_mixed_content():
    # 這 is traditional, rest already simplified
    assert normalize_chinese("這是混合simplified") == "这是混合simplified"


def test_empty_string():
    assert normalize_chinese("") == ""


def test_non_chinese_passthrough():
    assert normalize_chinese("hello world") == "hello world"


def test_punctuation_preserved():
    # Punctuation must not be dropped or garbled by OpenCC's separator regex
    assert normalize_chinese("這，那") == "这，那"
