from app.vocab.prompt import build_story_prompt, CharPromptInput, ComponentPromptInput


def test_prompt_includes_word_pinyin_meaning():
    prompt = build_story_prompt(
        word="练习",
        pinyin="liànxí",
        meaning="to practice, exercise, drill",
        sino_vietnamese="luyện tập",
        characters=[
            CharPromptInput(
                char="练", pinyin="liàn", sino_vietnamese="luyện",
                meaning="to drill, refine",
                components=[ComponentPromptInput(name="silk thread", meaning="fibres pulled together")],
            ),
            CharPromptInput(
                char="习", pinyin="xí", sino_vietnamese="tập",
                meaning="to practice, habit",
                components=[ComponentPromptInput(name="feather", meaning="young bird wing")],
            ),
        ],
    )
    assert "练习" in prompt
    assert "liànxí" in prompt
    assert "to practice, exercise, drill" in prompt
    assert "luyện tập" in prompt


def test_prompt_includes_each_character_block():
    prompt = build_story_prompt(
        word="学习", pinyin="xuéxí", meaning="to study", sino_vietnamese="học tập",
        characters=[
            CharPromptInput(char="学", pinyin="xué", sino_vietnamese="học",
                            meaning="to learn", components=[]),
            CharPromptInput(char="习", pinyin="xí", sino_vietnamese="tập",
                            meaning="to practice", components=[]),
        ],
    )
    assert "学" in prompt and "học" in prompt
    assert "习" in prompt and "tập" in prompt


def test_prompt_handles_missing_sino_vietnamese():
    """If a character has no Sino-Vietnamese reading, prompt notes the absence."""
    prompt = build_story_prompt(
        word="一", pinyin="yī", meaning="one", sino_vietnamese="nhất",
        characters=[
            CharPromptInput(char="一", pinyin="yī", sino_vietnamese=None,
                            meaning="one", components=[]),
        ],
    )
    assert "Hán Việt: (none)" in prompt or "no Sino-Vietnamese" in prompt.lower()


def test_prompt_lists_components():
    prompt = build_story_prompt(
        word="练", pinyin="liàn", meaning="drill", sino_vietnamese="luyện",
        characters=[
            CharPromptInput(
                char="练", pinyin="liàn", sino_vietnamese="luyện",
                meaning="to drill",
                components=[
                    ComponentPromptInput(name="silk thread", meaning="fibres"),
                    ComponentPromptInput(name="select", meaning="sort"),
                ],
            ),
        ],
    )
    assert "silk thread" in prompt
    assert "select" in prompt
