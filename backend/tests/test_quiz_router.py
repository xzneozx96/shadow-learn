import pytest
from app.routers.quiz import WordInput, QuizRequest, _build_cloze_prompt, _build_pronunciation_prompt


def test_word_input_uses_romanization_field():
    """WordInput must accept 'romanization', not 'pinyin'."""
    w = WordInput(word="hello", romanization="/həˈloʊ/", meaning="a greeting", usage="Hello world")
    assert w.romanization == "/həˈloʊ/"
    assert not hasattr(w, "pinyin")


def test_quiz_request_has_source_language():
    """QuizRequest must have source_language, defaulting to zh-CN."""
    req = QuizRequest(
        openrouter_api_key="key",
        words=[WordInput(word="你好", romanization="nǐ hǎo", meaning="hello", usage="你好世界")],
        exercise_type="cloze",
    )
    assert req.source_language == "zh-CN"


def test_build_cloze_prompt_english():
    """Cloze prompt for English should say 'English' not 'Mandarin Chinese'."""
    from app.services.language_config import get_language_config
    words = [WordInput(word="hello", romanization="/həˈloʊ/", meaning="greeting", usage="Hello world")]
    lang_cfg = get_language_config("en")
    prompt = _build_cloze_prompt(words, story_count=1, lang_cfg=lang_cfg)
    assert "English" in prompt
    assert "Chinese" not in prompt
