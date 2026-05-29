from app.lessons.services.segmentation_provider import (
    ChineseSegmentationProvider,
    get_segmentation_provider,
)


def test_chinese_segmentation_splits_words():
    tokens = ChineseSegmentationProvider().segment("我喜欢学习中文")
    assert tokens == ["我", "喜欢", "学习", "中文"]


def test_chinese_segmentation_drops_punctuation():
    tokens = ChineseSegmentationProvider().segment("我喜欢学习中文。")
    assert "。" not in tokens
    assert tokens[-1] == "中文"


def test_chinese_segmentation_tokens_are_substrings():
    text = "今天天气很好，我们去公园吧！"
    tokens = ChineseSegmentationProvider().segment(text)
    assert tokens  # non-empty
    for tok in tokens:
        assert tok in text  # exact substring — frontend buildWordSpans contract


def test_get_segmentation_provider_chinese():
    assert isinstance(get_segmentation_provider("zh-CN"), ChineseSegmentationProvider)
    assert isinstance(get_segmentation_provider("zh-TW"), ChineseSegmentationProvider)


def test_get_segmentation_provider_other_languages_none():
    assert get_segmentation_provider("ja") is None
    assert get_segmentation_provider("en") is None
    assert get_segmentation_provider("ko") is None
