# Multi-Language Exercise Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all exercises, shadowing, and the processing pipeline language-agnostic so any source language can be added by declaring its capabilities in one registry entry per side, without touching exercise or pipeline logic.

**Architecture:** Backend gets a `RomanizationProvider` protocol replacing hardcoded `generate_pinyin`, plus a `language_config.py` registry for LLM prompts. Frontend gets `language-caps.ts` + `romanization-utils.ts` utility libraries; exercises receive a `LanguageCapabilities` prop instead of branching on raw language strings. Field names `chinese`/`pinyin` are renamed to `text`/`romanization` throughout, with an IndexedDB v3→v4 migration for existing user data.

**Tech Stack:** Python 3.11 · FastAPI · Pydantic / React 19 · TypeScript · idb (IndexedDB) / vitest

---

## File Map

### Backend — New
- `backend/app/services/language_config.py` — language name + romanization description for LLM prompts
- `backend/app/services/romanization_provider.py` — `RomanizationProvider` protocol + Chinese/English/Null impls
- `backend/tests/test_romanization_provider.py` — new tests

### Backend — Modified
- `backend/app/models.py` — `Segment.chinese→text`, `Segment.pinyin→romanization`, `Word.pinyin→romanization`
- `backend/app/routers/lessons.py` — assembly keys renamed; `_shared_pipeline` uses romanizer; `source_language` threaded to services
- `backend/app/services/translation.py` — add `source_language` param + language-aware prompt
- `backend/app/services/vocabulary.py` — `WordEntry.pinyin→romanization`; add `source_language` param + language-aware prompt
- `backend/app/routers/quiz.py` — `WordInput.pinyin→romanization`; add `QuizRequest.source_language`; language-aware prompts
- `backend/app/routers/translation_exercise.py` — `source_language`/`target_language` from `Literal['chinese','english']` → `str`
- `backend/pyproject.toml` — add `eng-to-ipa>=0.0.2`
- `backend/tests/test_lessons_router.py` — field name assertions updated
- `backend/tests/test_quiz_router.py` — new tests for renamed field + source_language
- `backend/tests/test_translation.py` — `source_language` param added
- `backend/tests/test_vocabulary.py` — `romanization` field in fixtures

### Frontend — New
- `frontend/src/lib/language-caps.ts` — `LanguageCapabilities` + `LANGUAGE_CAPS` + `getLanguageCaps()`
- `frontend/src/lib/romanization-utils.ts` — `compareRomanization()` dispatching per system
- `frontend/src/components/ui/LanguageInput.tsx` — `ChineseInput` vs plain `Input` switcher
- `frontend/tests/romanization-utils.test.ts` — new tests

### Frontend — Modified
- `frontend/src/types.ts` — `Segment.chinese→text`, `Segment.pinyin→romanization`, `Word.pinyin→romanization`, `VocabEntry.pinyin→romanization`, `VocabEntry.sourceSegmentChinese→sourceSegmentText`, add `VocabEntry.sourceLanguage`
- `frontend/src/db/index.ts` — `DB_VERSION→4`, migration branch for segments + vocabulary stores
- `frontend/src/contexts/VocabularyContext.tsx` — field renames at save; add `sourceLanguage`
- `frontend/src/components/lesson/SegmentText.tsx` — `word.pinyin→romanization`
- `frontend/src/components/lesson/TranscriptPanel.tsx` — `segment.chinese→text`, `segment.pinyin→romanization`
- `frontend/src/components/lesson/LessonWorkbookPanel.tsx` — `entry.pinyin→romanization`
- `frontend/src/components/lesson/CompanionPanel.tsx` — `activeSegment.chinese→text`
- `frontend/src/components/shadowing/ShadowingRevealPhase.tsx` — `segment.chinese→text`, `segment.pinyin→romanization`
- `frontend/src/components/shadowing/ShadowingModePicker.tsx` — `startSegment.chinese→text`
- `frontend/src/components/shadowing/ShadowingSessionSummary.tsx` — `seg?.chinese→seg?.text`
- `frontend/src/components/workbook/WordCard.tsx` — `entry.pinyin→romanization`
- `frontend/src/components/study/ModePicker.tsx` — `'pinyin'→'romanization-recall'`; `caps` prop for dynamic labels
- `frontend/src/components/study/StudySession.tsx` — derive+thread `caps`; update `distributeExercises`; rename fallback + render condition; update `Question.translationData`
- `frontend/src/components/study/exercises/PinyinRecallExercise.tsx` → **deleted** (replaced by `RomanizationRecallExercise.tsx`)
- `frontend/src/components/study/exercises/RomanizationRecallExercise.tsx` — **new**, caps-driven
- `frontend/src/components/study/exercises/CharacterWritingExercise.tsx` — `entry.pinyin→romanization`; `caps` prop
- `frontend/src/components/study/exercises/DictationExercise.tsx` — `LanguageInput`; `caps`; `sourceSegmentChinese→sourceSegmentText`
- `frontend/src/components/study/exercises/ReconstructionExercise.tsx` — `sourceSegmentChinese→sourceSegmentText`
- `frontend/src/components/study/exercises/TranslationExercise.tsx` — `Sentence` interface rename; `LanguageInput`; wire-format fix
- `frontend/src/components/shadowing/ShadowingDictationPhase.tsx` — `LanguageInput`; `caps`
- `frontend/src/components/shadowing/ShadowingPanel.tsx` — derive + thread `caps`
- `frontend/src/hooks/useQuizGeneration.ts` — `pinyin→romanization` in wordMap; `source_language` param; `TranslationResult` boundary mapping
- `frontend/tests/StudySession.test.tsx` — update `'pinyin'→'romanization-recall'`
- `frontend/tests/useVocabulary.test.ts` — field rename assertions

---

### Task 1: Backend data model field renames + assembly update

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/routers/lessons.py` (assembly block lines 78–89)
- Modify: `backend/app/routers/chat.py` (uses `Segment` model)
- Modify: `backend/tests/test_lessons_router.py`

The `models.py` `Segment` and `Word` classes define the documented API contract. The assembly block in `lessons.py` translates pipeline dicts to that contract. Both rename together. `ChatRequest.active_segment` is `Segment | None`, so `chat.py` also references `segment.chinese` in its prompt string — update that too.

- [ ] **Step 1: Scan all backend references to the old field names**

```bash
cd backend && grep -rn '\.chinese\|\.pinyin\|"chinese"\|"pinyin"' app/ --include="*.py"
```

Note all occurrences — every one will be fixed in this task.

- [ ] **Step 2: Write a failing test asserting the assembled segment uses `text` and `romanization` keys**

Add to `backend/tests/test_lessons_router.py`:

```python
import asyncio
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_shared_pipeline_assembles_text_and_romanization_keys():
    """Assembled segment dicts must use 'text'/'romanization', not 'chinese'/'pinyin'."""
    from app.routers.lessons import _shared_pipeline
    import app.jobs as jobs_module
    from app.jobs import Job

    job_id = "test-field-rename"
    jobs_module.jobs[job_id] = Job(status="processing", step="queued", result=None, error=None)

    raw_segments = [{"id": 0, "start": 0.0, "end": 1.0, "text": "Hello world"}]

    with (
        patch("app.routers.lessons.translate_segments", new=AsyncMock(return_value=raw_segments)),
        patch("app.routers.lessons.extract_vocabulary", new=AsyncMock(return_value={})),
        patch("app.routers.lessons.get_romanization_provider"),  # will fail until Task 6 wires it
    ):
        await _shared_pipeline(
            job_id, raw_segments, ["es"], "key", "title", "upload", None, 60.0,
            source_language="en",
        )

    result = jobs_module.jobs[job_id].result
    seg = result["lesson"]["segments"][0]
    assert "text" in seg, "assembled segment must use 'text' not 'chinese'"
    assert "chinese" not in seg
    assert "romanization" in seg
    assert "pinyin" not in seg
    del jobs_module.jobs[job_id]
```

- [ ] **Step 3: Run to confirm failure**

```bash
cd backend && python -m pytest tests/test_lessons_router.py::test_shared_pipeline_assembles_text_and_romanization_keys -v
```

Expected: FAIL (import error or assertion error)

- [ ] **Step 4: Rename fields in `backend/app/models.py`**

```python
class Word(BaseModel):
    word: str
    romanization: str    # was: pinyin
    meaning: str
    usage: str


class Segment(BaseModel):
    id: str
    start: float
    end: float
    text: str            # was: chinese
    romanization: str    # was: pinyin
    translations: dict[str, str]
    words: list[Word]
```

- [ ] **Step 5: Update the assembly block in `backend/app/routers/lessons.py` (lines ~78–89)**

```python
lesson_segments.append({
    "id": str(seg["id"]),
    "start": seg["start"],
    "end": seg["end"],
    "text": seg["text"],                       # was: "chinese": seg["text"]
    "romanization": seg.get("romanization", ""),  # was: "pinyin": seg.get("pinyin", "")
    "translations": seg.get("translations", {}),
    "words": vocab_map.get(seg["id"]) or vocab_map.get(str(seg["id"])) or [],
    "wordTimings": seg.get("word_timings") or None,
})
```

> **Note:** Keep `from app.services.pinyin import generate_pinyin` import for now — Task 6 removes it when the romanizer replaces it.

- [ ] **Step 6: Update `backend/app/routers/chat.py` — find and rename `segment.chinese`**

```bash
grep -n "chinese\|pinyin" backend/app/routers/chat.py
```

Replace `segment.chinese` → `segment.text` and `segment.pinyin` → `segment.romanization` in any prompt-building code.

- [ ] **Step 7: Update existing test assertions that checked for `"chinese"` or `"pinyin"` output keys**

```bash
grep -n '"chinese"\|"pinyin"\|\.chinese\|\.pinyin' backend/tests/test_lessons_router.py
```

Update each match.

- [ ] **Step 8: Run the full test suite**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: All previously passing tests still pass. The new test (`test_shared_pipeline_assembles_text_and_romanization_keys`) will still fail because `get_romanization_provider` doesn't exist yet — that's expected and OK for now; skip it with `@pytest.mark.skip` if it blocks the suite.

- [ ] **Step 9: Commit**

```bash
git add backend/app/models.py backend/app/routers/lessons.py backend/app/routers/chat.py backend/tests/test_lessons_router.py
git commit -m "feat(backend): rename chinese/pinyin→text/romanization in models, assembly, and chat router"
```

---

### Task 2: Language config + romanization provider

**Files:**
- Create: `backend/app/services/language_config.py`
- Create: `backend/app/services/romanization_provider.py`
- Create: `backend/tests/test_romanization_provider.py`
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_romanization_provider.py
import pytest
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


def test_get_language_config_fallback():
    from app.services.language_config import get_language_config
    cfg = get_language_config("zh-CN")
    assert cfg["language_name"] == "Chinese (Mandarin)"
    # Unknown language falls back to zh-CN
    fallback = get_language_config("xx-UNKNOWN")
    assert fallback["language_name"] == "Chinese (Mandarin)"
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend && python -m pytest tests/test_romanization_provider.py -v
```

Expected: FAIL (ImportError — files don't exist)

- [ ] **Step 3: Create `backend/app/services/language_config.py`**

```python
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
```

- [ ] **Step 4: Create `backend/app/services/romanization_provider.py`**

```python
"""Pluggable romanization providers — one per language family."""

from typing import Protocol


class RomanizationProvider(Protocol):
    def romanize_text(self, text: str) -> str: ...
    def romanize_word(self, word: str) -> str: ...


class ChineseRomanizationProvider:
    def romanize_text(self, text: str) -> str:
        from app.services.pinyin import generate_pinyin
        return generate_pinyin(text)

    def romanize_word(self, word: str) -> str:
        from app.services.pinyin import generate_pinyin
        return generate_pinyin(word)


class EnglishRomanizationProvider:
    def romanize_text(self, text: str) -> str:
        import eng_to_ipa  # type: ignore[import]
        return eng_to_ipa.convert(text)

    def romanize_word(self, word: str) -> str:
        import eng_to_ipa  # type: ignore[import]
        return eng_to_ipa.convert(word)


class NullRomanizationProvider:
    def romanize_text(self, text: str) -> str:
        return ""

    def romanize_word(self, word: str) -> str:
        return ""


def get_romanization_provider(source_language: str) -> RomanizationProvider:
    """Return the appropriate romanization provider for source_language."""
    if source_language.startswith("zh"):
        return ChineseRomanizationProvider()
    if source_language.startswith("en"):
        return EnglishRomanizationProvider()
    return NullRomanizationProvider()
```

- [ ] **Step 5: Add `eng-to-ipa` to `backend/pyproject.toml`**

In the `[project]` `dependencies` list (after the `pypinyin` line), add:
```
"eng-to-ipa>=0.0.2",
```

- [ ] **Step 6: Install the dependency**

```bash
cd backend && pip install eng-to-ipa
```

- [ ] **Step 7: Run tests**

```bash
cd backend && python -m pytest tests/test_romanization_provider.py -v
```

Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/language_config.py backend/app/services/romanization_provider.py backend/tests/test_romanization_provider.py backend/pyproject.toml
git commit -m "feat(backend): add language_config registry and pluggable RomanizationProvider"
```

---

### Task 3: Vocabulary service — WordEntry rename + language-aware prompt

**Files:**
- Modify: `backend/app/services/vocabulary.py`
- Modify: `backend/tests/test_vocabulary.py`

- [ ] **Step 1: Add failing test for language-aware prompt**

Add to `backend/tests/test_vocabulary.py`:

```python
def test_build_vocab_prompt_english():
    """English prompt should say 'English language teacher' and 'IPA', not 'Chinese'."""
    from app.services.vocabulary import _build_vocab_prompt
    segments = [{"id": 0, "text": "Hello world"}]
    prompt = _build_vocab_prompt(segments, source_language="en")
    assert "English" in prompt
    assert "IPA" in prompt
    assert "Chinese" not in prompt
```

Update the `_valid_vocab_content` fixture helper to use `"romanization"` instead of `"pinyin"`:

```python
def _valid_vocab_content(seg_ids: list[int]) -> str:
    return json.dumps({
        "segments": [
            {"id": i, "words": [{"word": "你好", "romanization": "nǐ hǎo", "meaning": "hello", "usage": "你好世界"}]}
            for i in seg_ids
        ]
    })
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend && python -m pytest tests/test_vocabulary.py -v
```

Expected: FAIL — `_valid_vocab_content` fixtures fail Pydantic validation because `WordEntry` still has `pinyin` field; `test_build_vocab_prompt_english` fails because `source_language` param doesn't exist yet.

- [ ] **Step 3: Update `backend/app/services/vocabulary.py`**

**a) Rename `WordEntry.pinyin` → `romanization`:**
```python
class WordEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    word: str
    romanization: str    # was: pinyin
    meaning: str
    usage: str
```

**b) Update `_build_vocab_prompt` to accept `source_language` and use `get_language_config`:**

```python
from app.services.language_config import get_language_config

def _build_vocab_prompt(segments: list[dict], source_language: str = "zh-CN") -> str:
    """Build a prompt to extract key vocabulary from segments."""
    lang_cfg = get_language_config(source_language)
    no_romanization = lang_cfg["romanization_description"].startswith("leave empty")
    romanization_line = (
        '- "romanization": leave as empty string ""\n'
        if no_romanization
        else f'- "romanization": {lang_cfg["romanization_description"]}\n'
    )
    segments_text = "\n".join(
        f'{{"id": {seg["id"]}, "text": "{seg["text"]}"}}'
        for seg in segments
    )
    return (
        f"You are a {lang_cfg['language_name']} language teacher. For each segment below, break down ALL meaningful words and phrases.\n"
        "Include every content word (nouns, verbs, adjectives, adverbs, measure words, grammar particles).\n"
        "Skip only pure punctuation. The goal is that a student can hover over ANY word and see its meaning.\n\n"
        "For each word provide:\n"
        '- "word": the characters/text exactly as they appear in the segment\n'
        + romanization_line +
        '- "meaning": concise English meaning\n'
        '- "usage": a short example sentence (different from the source)\n\n'
        f"Segments:\n{segments_text}\n\n"
        "IMPORTANT: Cover ALL words in each segment, not just key vocabulary.\n\n"
        "Return a JSON object with this exact structure:\n"
        '{"segments": [{"id": <int>, "words": [{"word": "<str>", "romanization": "<str>", "meaning": "<str>", "usage": "<str>"}]}]}'
    )
```

**c) Thread `source_language` through `_extract_batch_with_retry` and `extract_vocabulary`:**

```python
async def _extract_batch_with_retry(
    segments: list[dict],
    api_key: str,
    semaphore: asyncio.Semaphore,
    source_language: str = "zh-CN",      # new param
) -> dict[int, list[dict]]:
    seg_ids = [s["id"] for s in segments]
    prompt = _build_vocab_prompt(segments, source_language)   # pass it
    # ... rest unchanged


async def extract_vocabulary(
    segments: list[dict],
    api_key: str,
    source_language: str = "zh-CN",      # new param
) -> dict[int, list[dict]]:
    # ...
    tasks = [
        asyncio.create_task(_extract_batch_with_retry(batch, api_key, semaphore, source_language))
        for batch in batches
    ]
```

- [ ] **Step 4: Run vocabulary tests**

```bash
cd backend && python -m pytest tests/test_vocabulary.py -v
```

Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/vocabulary.py backend/tests/test_vocabulary.py
git commit -m "feat(vocab): rename WordEntry.pinyin→romanization, add source_language param and language-aware prompt"
```

---

### Task 4: Translation service — language-aware prompt

**Files:**
- Modify: `backend/app/services/translation.py`
- Modify: `backend/tests/test_translation.py`

- [ ] **Step 1: Add failing test for language-aware prompt**

Add to `backend/tests/test_translation.py`:

```python
def test_build_translation_prompt_english():
    """English source language should mention 'English' in the prompt, not 'Chinese'."""
    segments = [{"id": 0, "text": "Hello world"}]
    languages = ["Spanish"]
    prompt = _build_translation_prompt(segments, languages, source_language="en")
    assert "English" in prompt
    assert "Chinese" not in prompt
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend && python -m pytest tests/test_translation.py::test_build_translation_prompt_english -v
```

Expected: FAIL (TypeError — `source_language` param not accepted)

- [ ] **Step 3: Update `backend/app/services/translation.py`**

Add import, add `source_language` param to `_build_translation_prompt`, `_translate_batch`, and `translate_segments`:

```python
from app.services.language_config import get_language_config

def _build_translation_prompt(
    segments: list[dict],
    languages: list[str],
    source_language: str = "zh-CN",    # new
) -> str:
    lang_cfg = get_language_config(source_language)
    language_list = ", ".join(languages)
    segments_text = "\n".join(
        f'{{"id": {seg["id"]}, "text": "{seg["text"]}"}}'
        for seg in segments
    )
    example_langs = [{"language": lang, "text": "<translated text>"} for lang in languages]
    return (
        f"You are a professional translator specializing in {lang_cfg['language_name']}.\n"
        f"Translate each segment below into the following languages: {language_list}.\n\n"
        f"Segments:\n{segments_text}\n\n"
        f"Respond with a JSON object in exactly this structure:\n"
        f'{{"translations": [{{"id": <segment_id>, "translations": {example_langs}}}, ...]}}\n\n'
        f"Include every segment ID. Output only the JSON object, no other text."
    )


async def _translate_batch(
    segments: list[dict],
    languages: list[str],
    api_key: str,
    source_language: str = "zh-CN",    # new
) -> list[dict]:
    prompt = _build_translation_prompt(segments, languages, source_language)
    # ... rest of function unchanged


async def translate_segments(
    segments: list[dict],
    languages: list[str],
    api_key: str,
    source_language: str = "zh-CN",    # new
) -> list[dict]:
    batch_size = settings.translation_batch_size
    results: list[dict] = []
    for i in range(0, len(segments), batch_size):
        batch = segments[i : i + batch_size]
        translated = await _translate_batch(batch, languages, api_key, source_language)
        results.extend(translated)
    return results
```

- [ ] **Step 4: Run translation tests**

```bash
cd backend && python -m pytest tests/test_translation.py -v
```

Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/translation.py backend/tests/test_translation.py
git commit -m "feat(translation): add source_language param and language-aware translator prompt"
```

---

### Task 5: Quiz router — language-aware prompts + field rename

**Files:**
- Modify: `backend/app/routers/quiz.py`
- Create: `backend/tests/test_quiz_router.py`

`WordInput.pinyin` → `romanization`. `QuizRequest` gains `source_language`. System message and prompt builders use `get_language_config`.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_quiz_router.py`:

```python
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
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend && python -m pytest tests/test_quiz_router.py -v
```

Expected: FAIL — `WordInput` has `pinyin` field, `QuizRequest` has no `source_language`, `_build_cloze_prompt` doesn't accept `lang_cfg`.

- [ ] **Step 3: Update `backend/app/routers/quiz.py`**

**a) Add import:**
```python
from app.services.language_config import get_language_config
```

**b) Rename `WordInput.pinyin` → `romanization`:**
```python
class WordInput(BaseModel):
    word: str
    romanization: str    # was: pinyin
    meaning: str
    usage: str
```

**c) Add `source_language` to `QuizRequest`:**
```python
class QuizRequest(BaseModel):
    openrouter_api_key: str
    words: list[WordInput]
    exercise_type: str
    story_count: int = 1
    count: int = 5
    source_language: str = "zh-CN"    # new
```

**d) Update prompt builders to accept `lang_cfg` dict instead of hardcoding Chinese:**

```python
def _build_cloze_prompt(words: list[WordInput], story_count: int, lang_cfg: dict) -> str:
    word_list = "\n".join(f"- {w.word} ({w.romanization}): {w.meaning}" for w in words[:5])
    return (
        f"Generate {story_count} short cohesive {lang_cfg['language_name']} story(ies) using these vocabulary words:\n"
        f"{word_list}\n\n"
        "Rules:\n"
        "- Each story should be 2-3 sentences, using up to 5 of these words naturally.\n"
        "- Mark each vocabulary word occurrence with {{word}}, e.g. {{今天}}.\n"
        "- The blanks array must list each marked vocabulary word in order of appearance."
    )


def _build_pronunciation_prompt(words: list[WordInput], count: int, lang_cfg: dict) -> str:
    word_list = "\n".join(f"- {w.word} ({w.romanization}): {w.meaning}" for w in words)
    return (
        f"Generate {count} short, natural {lang_cfg['language_name']} sentences for pronunciation practice "
        f"using these vocabulary words:\n{word_list}\n\n"
        "Rules:\n"
        "- Each sentence should incorporate at least one vocabulary word.\n"
        "- Include an English translation for each sentence."
    )
```

**e) Update `generate_quiz` endpoint to derive `lang_cfg` and use language-aware system message:**

```python
@router.post("/generate", response_model=QuizResponse)
async def generate_quiz(req: QuizRequest):
    lang_cfg = get_language_config(req.source_language)

    if req.exercise_type == "cloze":
        prompt = _build_cloze_prompt(req.words, req.story_count, lang_cfg)
        response_format = _CLOZE_SCHEMA
    elif req.exercise_type == "pronunciation_sentence":
        prompt = _build_pronunciation_prompt(req.words, req.count, lang_cfg)
        response_format = _PRONUNCIATION_SCHEMA
    else:
        raise HTTPException(400, f"Unknown exercise_type: {req.exercise_type}")

    payload = {
        "model": settings.openrouter_model,
        "messages": [
            {
                "role": "system",
                "content": f"You are a {lang_cfg['language_name']} teacher creating learning exercises.",
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "response_format": response_format,
        "reasoning": {"effort": "none"},
    }
    # ... rest unchanged
```

- [ ] **Step 4: Run quiz tests**

```bash
cd backend && python -m pytest tests/test_quiz_router.py -v
```

Expected: All PASS

- [ ] **Step 5: Run full backend test suite**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/quiz.py backend/tests/test_quiz_router.py
git commit -m "feat(quiz): rename pinyin→romanization in WordInput, add source_language, language-aware prompts"
```

---

### Task 6: Pipeline wiring — use romanizer, thread source_language to all services

**Files:**
- Modify: `backend/app/routers/lessons.py`

Replace the hardcoded `generate_pinyin` call with `get_romanization_provider`. Thread `source_language` to `translate_segments` and `extract_vocabulary`.

- [ ] **Step 1: Update `backend/app/routers/lessons.py`**

**a) Replace import:**
```python
# Remove:
from app.services.pinyin import generate_pinyin
# Add:
from app.services.romanization_provider import get_romanization_provider
```

**b) Replace romanization block in `_shared_pipeline` (the `is_chinese`/`generate_pinyin` logic, lines ~51–61):**

```python
jobs[job_id].step = "romanization"
t0 = time.monotonic()
romanizer = get_romanization_provider(source_language)
enriched_segments = []
for seg in segments:
    enriched_segments.append({**seg, "romanization": romanizer.romanize_text(seg["text"])})
logger.info("[pipeline] romanization: done in %.1fs (source_language=%s)", time.monotonic() - t0, source_language)
```

**c) Pass `source_language` to `translate_segments` and `extract_vocabulary`:**

```python
translated_segments, vocab_map = await asyncio.gather(
    translate_segments(
        enriched_segments, translation_languages, api_key,
        source_language=source_language,
    ),
    extract_vocabulary(
        enriched_segments, api_key,
        source_language=source_language,
    ),
)
```

- [ ] **Step 2: Remove `@pytest.mark.skip` from the test added in Task 1 (if skipped)**

The test `test_shared_pipeline_assembles_text_and_romanization_keys` should now pass with the correct mock setup. Update the mock to not patch `get_romanization_provider` as a failure point:

```python
# The test patches get_romanization_provider — update to return a real mock:
from unittest.mock import MagicMock
mock_romanizer = MagicMock()
mock_romanizer.romanize_text.return_value = ""

with (
    patch("app.routers.lessons.translate_segments", new=AsyncMock(return_value=raw_segments)),
    patch("app.routers.lessons.extract_vocabulary", new=AsyncMock(return_value={})),
    patch("app.routers.lessons.get_romanization_provider", return_value=mock_romanizer),
):
```

- [ ] **Step 3: Run full backend test suite**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: All PASS including `test_shared_pipeline_assembles_text_and_romanization_keys`

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/lessons.py backend/tests/test_lessons_router.py
git commit -m "feat(pipeline): use RomanizationProvider, thread source_language to translate and vocab services"
```

---

### Task 7: Frontend types + DB migration

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/db/index.ts`

**Critical:** The DB migration runs once per user on first load after upgrade. The segments store holds `Segment[]` arrays (not flat records) keyed by `lessonId`. The vocabulary store holds flat `VocabEntry` records.

- [ ] **Step 1: Update `frontend/src/types.ts`**

```typescript
export interface Word {
  word: string
  romanization: string    // was: pinyin
  meaning: string
  usage: string
}

export interface Segment {
  id: string
  start: number
  end: number
  text: string            // was: chinese
  romanization: string    // was: pinyin
  translations: Record<string, string>
  words: Word[]
  wordTimings?: WordTiming[]
}

export interface VocabEntry {
  id: string
  word: string
  romanization: string          // was: pinyin
  meaning: string
  usage: string
  sourceLessonId: string
  sourceLessonTitle: string
  sourceSegmentId: string
  sourceSegmentText: string     // was: sourceSegmentChinese
  sourceSegmentTranslation: string
  sourceLanguage: string        // new — 'zh-CN' for migrated entries
  createdAt: string
}
```

Keep `WordTiming`, `LessonMeta`, `ChatMessage`, `AppSettings`, `DecryptedKeys`, and all pronunciation types unchanged.

- [ ] **Step 2: Bump DB_VERSION and add migration in `frontend/src/db/index.ts`**

Change line 6: `const DB_VERSION = 3` → `const DB_VERSION = 4`

The `upgrade` callback currently takes `(db, oldVersion)` — make it `async` and add `_newVersion` and `transaction` parameters (idb v5 passes them as 3rd and 4th args). The idb library awaits the Promise returned by an async upgrade callback, so `await` inside is safe and the transaction stays open until all awaits complete.

```typescript
async upgrade(db, oldVersion, _newVersion, transaction) {
  if (oldVersion < 1) { /* ... unchanged ... */ }
  if (oldVersion < 2) { /* ... unchanged ... */ }
  if (oldVersion < 3) { /* ... unchanged ... */ }
  if (oldVersion < 4) {
    // segments store: each record value is a Segment[] array stored under lessonId as key
    const segStore = transaction.objectStore('segments')
    let segCursor = await segStore.openCursor()
    while (segCursor) {
      const segments = segCursor.value as any[]
      const migrated = segments.map((s: any) => {
        const { chinese, pinyin, ...rest } = s
        return {
          ...rest,
          text: chinese ?? s.text ?? '',
          romanization: pinyin ?? s.romanization ?? '',
        }
      })
      await segCursor.update(migrated)
      segCursor = await segCursor.continue()
    }

    // vocabulary store: each record is a flat VocabEntry
    const vocabStore = transaction.objectStore('vocabulary')
    let vocabCursor = await vocabStore.openCursor()
    while (vocabCursor) {
      const entry = vocabCursor.value as any
      const { pinyin, sourceSegmentChinese, ...rest } = entry
      await vocabCursor.update({
        ...rest,
        romanization: pinyin ?? entry.romanization ?? '',
        sourceSegmentText: sourceSegmentChinese ?? entry.sourceSegmentText ?? '',
        sourceLanguage: entry.sourceLanguage ?? 'zh-CN',
      })
      vocabCursor = await vocabCursor.continue()
    }
  }
},
```

- [ ] **Step 3: Run TypeScript check to see cascade errors**

```bash
cd frontend && npx tsc --noEmit 2>&1 | wc -l
```

This will surface all the downstream files that still use old field names. Record the error count — it will drop to zero after Tasks 8–12. Do not fix them here.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/db/index.ts
git commit -m "feat(types+db): rename chinese/pinyin→text/romanization, sourceSegmentChinese→sourceSegmentText, add sourceLanguage; DB migration v4"
```

---

### Task 8: Language caps + romanization utils + LanguageInput

**Files:**
- Create: `frontend/src/lib/language-caps.ts`
- Create: `frontend/src/lib/romanization-utils.ts`
- Create: `frontend/src/components/ui/LanguageInput.tsx`
- Create: `frontend/tests/romanization-utils.test.ts`

- [ ] **Step 1: Write failing tests for `compareRomanization`**

```typescript
// frontend/tests/romanization-utils.test.ts
import { describe, expect, it } from 'vitest'
import { compareRomanization } from '@/lib/romanization-utils'

describe('compareRomanization', () => {
  it('delegates to comparePinyin for pinyin system', () => {
    expect(compareRomanization('nǐ hǎo', 'nǐ hǎo', 'pinyin')).toBe(true)
    expect(compareRomanization('ni3 hao3', 'nǐ hǎo', 'pinyin')).toBe(true) // tone numbers
    expect(compareRomanization('wǒ', 'nǐ', 'pinyin')).toBe(false)
  })

  it('normalizes IPA by stripping stress marks and slashes', () => {
    expect(compareRomanization('/həˈloʊ/', 'həˈloʊ', 'ipa')).toBe(true)
    expect(compareRomanization('həˈloʊ', 'həˈloʊ', 'ipa')).toBe(true)
    expect(compareRomanization('hɛloʊ', 'həˈloʊ', 'ipa')).toBe(false)
  })

  it('normalizes romaji case-insensitively', () => {
    expect(compareRomanization('konnichiwa', 'Konnichiwa', 'romaji')).toBe(true)
    expect(compareRomanization('sayonara', 'konnichiwa', 'romaji')).toBe(false)
  })

  it('always returns false for none system', () => {
    expect(compareRomanization('anything', 'anything', 'none')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd frontend && npx vitest run tests/romanization-utils.test.ts
```

Expected: FAIL (import error — file doesn't exist)

- [ ] **Step 3: Create `frontend/src/lib/language-caps.ts`**

```typescript
export type RomanizationSystem = 'pinyin' | 'ipa' | 'romaji' | 'none'
export type InputMode = 'ime-chinese' | 'standard'

export interface LanguageCapabilities {
  romanizationSystem: RomanizationSystem
  romanizationLabel: string         // shown in exercise title: "Pinyin Recall", "IPA Recall"
  romanizationPlaceholder: string   // input hint in RomanizationRecallExercise
  hasCharacterWriting: boolean      // show/hide CharacterWritingExercise
  inputMode: InputMode              // drives LanguageInput: ChineseInput vs plain Input
  dictationPlaceholder: string      // placeholder in DictationExercise + ShadowingDictationPhase
  languageName: string              // "Chinese", "English" — informational
}

const LANGUAGE_CAPS: Record<string, LanguageCapabilities> = {
  'zh-CN': {
    romanizationSystem: 'pinyin',
    romanizationLabel: 'Pinyin',
    romanizationPlaceholder: 'e.g. nǐ hǎo or ni3 hao3',
    hasCharacterWriting: true,
    inputMode: 'ime-chinese',
    dictationPlaceholder: '输入汉字…',
    languageName: 'Chinese',
  },
  'zh-TW': {
    romanizationSystem: 'pinyin',
    romanizationLabel: 'Pinyin',
    romanizationPlaceholder: 'e.g. nǐ hǎo or ni3 hao3',
    hasCharacterWriting: true,
    inputMode: 'ime-chinese',
    dictationPlaceholder: '輸入漢字…',
    languageName: 'Chinese (Traditional)',
  },
  'en': {
    romanizationSystem: 'ipa',
    romanizationLabel: 'IPA',
    romanizationPlaceholder: 'e.g. /həˈloʊ/ or həˈloʊ',
    hasCharacterWriting: false,
    inputMode: 'standard',
    dictationPlaceholder: 'Type what you heard…',
    languageName: 'English',
  },
  'ja': {
    romanizationSystem: 'romaji',
    romanizationLabel: 'Romaji',
    romanizationPlaceholder: 'e.g. konnichiwa',
    hasCharacterWriting: true,
    inputMode: 'standard',
    dictationPlaceholder: 'テキストを入力…',
    languageName: 'Japanese',
  },
  'ko': {
    romanizationSystem: 'none',
    romanizationLabel: '',
    romanizationPlaceholder: '',
    hasCharacterWriting: false,
    inputMode: 'standard',
    dictationPlaceholder: 'Type what you heard…',
    languageName: 'Korean',
  },
  'vi': {
    romanizationSystem: 'none',
    romanizationLabel: '',
    romanizationPlaceholder: '',
    hasCharacterWriting: false,
    inputMode: 'standard',
    dictationPlaceholder: 'Type what you heard…',
    languageName: 'Vietnamese',
  },
}

export function getLanguageCaps(sourceLanguage?: string): LanguageCapabilities {
  if (!sourceLanguage) return LANGUAGE_CAPS['zh-CN']
  return (
    LANGUAGE_CAPS[sourceLanguage] ??
    LANGUAGE_CAPS[sourceLanguage.split('-')[0]] ??
    LANGUAGE_CAPS['zh-CN']
  )
}
```

- [ ] **Step 4: Create `frontend/src/lib/romanization-utils.ts`**

```typescript
import type { RomanizationSystem } from '@/lib/language-caps'
import { comparePinyin } from '@/lib/pinyin-utils'

export function compareRomanization(
  input: string,
  expected: string,
  system: RomanizationSystem,
): boolean {
  if (system === 'pinyin') return comparePinyin(input, expected)
  if (system === 'ipa') {
    const normalize = (s: string) => s.replace(/[/[\]ˈˌ.]/g, '').toLowerCase().trim()
    return normalize(input) === normalize(expected)
  }
  if (system === 'romaji') return input.trim().toLowerCase() === expected.trim().toLowerCase()
  return false
}
```

- [ ] **Step 5: Create `frontend/src/components/ui/LanguageInput.tsx`**

```tsx
import type { InputMode } from '@/lib/language-caps'
import type { ComponentProps } from 'react'
import { ChineseInput } from './ChineseInput'
import { Input } from './input'

interface LanguageInputProps extends ComponentProps<typeof Input> {
  inputMode: InputMode
  wrapperClassName?: string
}

export function LanguageInput({
  inputMode,
  wrapperClassName,
  value,
  onChange,
  ...props
}: LanguageInputProps) {
  if (inputMode === 'ime-chinese') {
    return (
      <ChineseInput
        value={(value as string) ?? ''}
        onChange={onChange as (e: React.ChangeEvent<HTMLInputElement>) => void}
        wrapperClassName={wrapperClassName}
        {...props}
      />
    )
  }
  return <Input value={value} onChange={onChange} {...props} />
}
```

- [ ] **Step 6: Run the romanization utils tests**

```bash
cd frontend && npx vitest run tests/romanization-utils.test.ts
```

Expected: All PASS

- [ ] **Step 7: TypeScript check on new files only**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "language-caps\|romanization-utils\|LanguageInput" | head -20
```

Expected: No errors on these new files

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/language-caps.ts frontend/src/lib/romanization-utils.ts frontend/src/components/ui/LanguageInput.tsx frontend/tests/romanization-utils.test.ts
git commit -m "feat(frontend): add language-caps, romanization-utils, and LanguageInput component"
```

---

### Task 9: VocabularyContext + cascade field renames

**Files (all mechanical field-name replacements):**
- Modify: `frontend/src/contexts/VocabularyContext.tsx`
- Modify: `frontend/src/components/lesson/SegmentText.tsx`
- Modify: `frontend/src/components/lesson/TranscriptPanel.tsx`
- Modify: `frontend/src/components/lesson/LessonWorkbookPanel.tsx`
- Modify: `frontend/src/components/lesson/CompanionPanel.tsx`
- Modify: `frontend/src/components/shadowing/ShadowingRevealPhase.tsx`
- Modify: `frontend/src/components/shadowing/ShadowingModePicker.tsx`
- Modify: `frontend/src/components/shadowing/ShadowingSessionSummary.tsx`
- Modify: `frontend/src/components/workbook/WordCard.tsx`

- [ ] **Step 1: Update `VocabularyContext.tsx`**

In the `save()` callback, update to use renamed fields and add `sourceLanguage`:

```typescript
const entry: VocabEntry = {
  id: crypto.randomUUID(),
  word: word.word,
  romanization: word.romanization,          // was: pinyin: word.pinyin
  meaning: word.meaning,
  usage: word.usage,
  sourceLessonId: lesson.id,
  sourceLessonTitle: lesson.title,
  sourceSegmentId: segment.id,
  sourceSegmentText: segment.text,          // was: sourceSegmentChinese: segment.chinese
  sourceSegmentTranslation: segment.translations[activeLang] ?? '',
  sourceLanguage: lesson.sourceLanguage ?? 'zh-CN',   // new
  createdAt: new Date().toISOString(),
}
```

- [ ] **Step 2: Update `SegmentText.tsx`**

Rename all occurrences:
- `span.word.pinyin` → `span.word.romanization`
- Any `segment.chinese` → `segment.text`

Also guard romanization display: `{span.word.romanization && <span ...>{span.word.romanization}</span>}`

- [ ] **Step 3: Update `TranscriptPanel.tsx`**

Scan for all references:
```bash
grep -n "chinese\|\.pinyin" frontend/src/components/lesson/TranscriptPanel.tsx
```

Replace:
- All `segment.chinese` → `segment.text` (search text, clipboard copy, TTS text, SegmentText `text` prop)
- All `segment.pinyin` → `segment.romanization`
- Guard display: `{segment.romanization && <p ...>{segment.romanization}</p>}`

- [ ] **Step 4: Update `LessonWorkbookPanel.tsx`**

- `entry.pinyin` → `entry.romanization`
- Guard: `{entry.romanization && <p className="text-sm text-muted-foreground">{entry.romanization}</p>}`

- [ ] **Step 5: Update `CompanionPanel.tsx`**

- `activeSegment.chinese` → `activeSegment.text`

- [ ] **Step 6: Update `ShadowingRevealPhase.tsx`**

Four changes in this file:
1. `computeCharDiff(props.userAnswer, segment.chinese)` → `computeCharDiff(props.userAnswer, segment.text)`
2. `{segment.chinese}` in the correct text display → `{segment.text}`
3. `{segment.pinyin && ...}` guard → `{segment.romanization && ...}` (update field name inside the block too)
4. Inside `SpeakingScores` sub-component: `form.append('reference_text', segment.chinese)` → `form.append('reference_text', segment.text)`

- [ ] **Step 7: Update `ShadowingModePicker.tsx`**

- `"${startSegment.chinese}"` → `"${startSegment.text}"` (in the `DialogDescription`)

- [ ] **Step 8: Update `ShadowingSessionSummary.tsx`**

- `seg?.chinese` → `seg?.text`

- [ ] **Step 9: Update `WordCard.tsx`**

- `entry.pinyin` → `entry.romanization`
- Guard: `{entry.romanization && <div className="text-sm text-muted-foreground italic mt-0.5">{entry.romanization}</div>}`

- [ ] **Step 10: TypeScript check — error count should be dramatically lower**

```bash
cd frontend && npx tsc --noEmit 2>&1 | wc -l
```

Remaining errors will be in exercise components (fixed in Tasks 10–12).

- [ ] **Step 11: Commit**

```bash
git add \
  frontend/src/contexts/VocabularyContext.tsx \
  frontend/src/components/lesson/SegmentText.tsx \
  frontend/src/components/lesson/TranscriptPanel.tsx \
  frontend/src/components/lesson/LessonWorkbookPanel.tsx \
  frontend/src/components/lesson/CompanionPanel.tsx \
  frontend/src/components/shadowing/ShadowingRevealPhase.tsx \
  frontend/src/components/shadowing/ShadowingModePicker.tsx \
  frontend/src/components/shadowing/ShadowingSessionSummary.tsx \
  frontend/src/components/workbook/WordCard.tsx
git commit -m "feat(frontend): cascade field renames across lesson, shadowing, and workbook components"
```

---

### Task 10: ModePicker + RomanizationRecallExercise

**Files:**
- Modify: `frontend/src/components/study/ModePicker.tsx`
- Create: `frontend/src/components/study/exercises/RomanizationRecallExercise.tsx`

Do **not** delete `PinyinRecallExercise.tsx` yet — that happens in Task 12 when `StudySession.tsx` is updated.

- [ ] **Step 1: Update `ModePicker.tsx`**

Add import, add `caps` prop, rename `'pinyin'` → `'romanization-recall'`, build MODES array dynamically:

```typescript
import type { LanguageCapabilities } from '@/lib/language-caps'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ExerciseMode =
  | 'cloze'
  | 'dictation'
  | 'romanization-recall'   // was: 'pinyin'
  | 'pronunciation'
  | 'reconstruction'
  | 'writing'
  | 'translation'
  | 'mixed'

interface ModePickerProps {
  selected: ExerciseMode
  onSelect: (mode: ExerciseMode) => void
  count: number
  onCountChange: (n: number) => void
  onStart: () => void
  lessonTitle: string
  loading?: boolean
  caps: LanguageCapabilities    // new
}

export function ModePicker({
  selected, onSelect, count, onCountChange, onStart, lessonTitle, loading, caps,
}: ModePickerProps) {
  const MODES: { id: ExerciseMode, icon: string, name: string, desc: string }[] = [
    { id: 'mixed', icon: '✍️🎧🎤', name: 'Mixed', desc: 'All types shuffled together' },
    { id: 'cloze', icon: '✍️', name: 'Cloze', desc: 'Fill blanks in a story' },
    { id: 'dictation', icon: '🎧', name: 'Dictation', desc: 'Hear it, type it' },
    ...(caps.romanizationSystem !== 'none' ? [{
      id: 'romanization-recall' as ExerciseMode,
      icon: '🔤',
      name: `${caps.romanizationLabel} Recall`,
      desc: `See the word, type its ${caps.romanizationLabel}`,
    }] : []),
    { id: 'pronunciation', icon: '🎤', name: 'Speak', desc: 'Pronounce & score' },
    { id: 'reconstruction', icon: '🔀', name: 'Rebuild', desc: 'Unscramble sentence' },
    ...(caps.hasCharacterWriting ? [{ id: 'writing' as ExerciseMode, icon: '✏️', name: 'Write', desc: 'Draw the characters' }] : []),
    { id: 'translation', icon: '🌐', name: 'Translate', desc: 'Translate & get AI feedback' },
  ]

  return (
    <div>
      {/* ... header unchanged ... */}
      <div className="grid grid-cols-3 gap-2 mb-8">
        {MODES.map(m => (
          <button key={m.id} onClick={() => onSelect(m.id)} className={/* ... unchanged ... */}>
            <span className="text-xl block mb-2">{m.icon}</span>
            <div className="text-sm font-semibold">{m.name}</div>
            <div className="text-sm text-muted-foreground mt-1 leading-tight">{m.desc}</div>
          </button>
        ))}
      </div>
      {/* ... count + start button unchanged ... */}
    </div>
  )
}
```

- [ ] **Step 2: Create `frontend/src/components/study/exercises/RomanizationRecallExercise.tsx`**

```tsx
import type { LanguageCapabilities } from '@/lib/language-caps'
import type { VocabEntry } from '@/types'
import { useState } from 'react'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { compareRomanization } from '@/lib/romanization-utils'
import { cn } from '@/lib/utils'

interface Props {
  entry: VocabEntry
  progress?: string
  onNext: (correct: boolean) => void
  playTTS: (text: string) => Promise<void>
  caps: LanguageCapabilities
}

export function RomanizationRecallExercise({ entry, progress = '', onNext, playTTS, caps }: Props) {
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState(false)
  const correct = compareRomanization(value, entry.romanization, caps.romanizationSystem)

  function handleCheck() {
    if (!value.trim()) return
    setChecked(true)
    if (correct) void playTTS(entry.word)
  }

  const footer = (
    <div className="flex items-center justify-center gap-3 p-3">
      <Button variant="ghost" size="sm" onClick={() => onNext(false)}>Skip</Button>
      {!checked
        ? <Button size="sm" onClick={handleCheck}>Check →</Button>
        : <Button size="sm" onClick={() => onNext(correct)}>Next →</Button>}
    </div>
  )

  return (
    <ExerciseCard
      type={`${caps.romanizationLabel} Recall`}
      progress={progress}
      footer={footer}
      info={`See the word and type its ${caps.romanizationLabel}. Tests pronunciation knowledge without speaking aloud.`}
    >
      <div className="text-center py-2 pb-5">
        <div className="text-[52px] font-extrabold tracking-widest leading-none text-foreground">
          {entry.word}
        </div>
        <p className="text-sm text-muted-foreground mt-3">{entry.meaning}</p>
      </div>

      <Input
        className="text-center"
        placeholder={caps.romanizationPlaceholder}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !checked && handleCheck()}
        disabled={checked}
      />
      <p className="text-[11px] text-muted-foreground/50 text-center mt-1.5">
        {caps.romanizationSystem === 'pinyin' ? 'Accepts tone marks or tone numbers' : `Type ${caps.romanizationLabel}`}
      </p>

      {checked && (
        <div className={cn(
          'mt-4 rounded-lg border px-4 py-3 text-sm',
          correct
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
            : 'border-destructive/25 bg-destructive/10 text-destructive',
        )}>
          {correct
            ? '✓ Correct!'
            : entry.romanization ? `✗ Incorrect — ${entry.romanization}` : '✗ Incorrect'}
        </div>
      )}
    </ExerciseCard>
  )
}
```

- [ ] **Step 3: TypeScript check on modified files**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "ModePicker\|RomanizationRecall" | head -20
```

Expected: No new errors in the new/modified files. Remaining errors from cascade are in other files.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/study/ModePicker.tsx frontend/src/components/study/exercises/RomanizationRecallExercise.tsx
git commit -m "feat(study): rename 'pinyin' mode to 'romanization-recall', add caps prop, create RomanizationRecallExercise"
```

---

### Task 11: Exercise adaptations

**Files:**
- Modify: `frontend/src/components/study/exercises/CharacterWritingExercise.tsx`
- Modify: `frontend/src/components/study/exercises/DictationExercise.tsx`
- Modify: `frontend/src/components/study/exercises/ReconstructionExercise.tsx`
- Modify: `frontend/src/components/study/exercises/TranslationExercise.tsx`
- Modify: `frontend/src/components/shadowing/ShadowingDictationPhase.tsx`
- Modify: `backend/app/routers/translation_exercise.py`

- [ ] **Step 1: Update `CharacterWritingExercise.tsx`**

Add `caps: LanguageCapabilities` prop. Replace all `entry.pinyin` → `entry.romanization`. Guard display:

```tsx
import type { LanguageCapabilities } from '@/lib/language-caps'

interface Props {
  entry: VocabEntry
  progress?: string
  onNext: (correct: boolean) => void
  caps: LanguageCapabilities    // new
}
// In render:
// entry.pinyin → entry.romanization (all occurrences)
// guard: {entry.romanization && <p className="text-sm text-muted-foreground/60 mt-1">{entry.romanization}</p>}
```

- [ ] **Step 2: Update `DictationExercise.tsx`**

Replace `ChineseInput` with `LanguageInput`. Replace `entry.sourceSegmentChinese` → `entry.sourceSegmentText`. Add `caps` prop:

```tsx
import type { LanguageCapabilities } from '@/lib/language-caps'
import { LanguageInput } from '@/components/ui/LanguageInput'
// Remove: import { ChineseInput } from '@/components/ui/ChineseInput'

interface Props {
  entry: VocabEntry
  progress?: string
  onNext: (correct: boolean) => void
  playTTS: (text: string) => Promise<void>
  loadingText: string | null
  caps: LanguageCapabilities    // new
}

export function DictationExercise({ entry, progress = '', onNext, playTTS, loadingText, caps }: Props) {
  const expected = entry.sourceSegmentText    // was: entry.sourceSegmentChinese
  // ...
  // Loading check: const isLoading = loadingText === entry.sourceSegmentText
  // TTS button: onClick={() => void playTTS(entry.sourceSegmentText)}

  // Replace <ChineseInput ...> with:
  return (
    // ...
    <LanguageInput
      inputMode={caps.inputMode}
      placeholder={caps.dictationPlaceholder}
      value={value}
      onChange={e => setValue(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && !checked && setChecked(true)}
      disabled={checked}
    />
    // ...
  )
}
```

- [ ] **Step 3: Update `ReconstructionExercise.tsx`**

Scan and replace all occurrences:
```bash
grep -n "sourceSegmentChinese" frontend/src/components/study/exercises/ReconstructionExercise.tsx
```

Replace each `entry.sourceSegmentChinese` → `entry.sourceSegmentText`. No other changes needed — the reconstruction logic is language-agnostic.

- [ ] **Step 4: Update `TranslationExercise.tsx`**

**a) Rename the local `Sentence` interface:**
```typescript
interface Sentence {
  text: string           // was: chinese
  romanization: string   // was: pinyin
  english: string
}
```

**b) Update derived variables using the new field names and use `caps.languageName` for direction labels:**
```typescript
const source = direction === 'zh-to-en' ? sentence.text : sentence.english
const reference = direction === 'zh-to-en' ? sentence.english : sentence.text

// Direction labels: use caps.languageName instead of hardcoded 'Chinese'/'English' strings
// The direction value itself ('en-to-zh'/'zh-to-en') is just an identifier, not the display label.
// sourceLang/targetLang are now derived from caps and sent to the backend as language codes:
const sourceLang = direction === 'zh-to-en' ? caps.languageName.toLowerCase() : 'english'
const targetLang = direction === 'zh-to-en' ? 'english' : caps.languageName.toLowerCase()
// Example display label (line ~209): `{targetLang === 'english' ? 'English' : caps.languageName}`
```

**c) Replace `sentence.pinyin` with `sentence.romanization` (two display locations):**
- Result view (`direction === 'en-to-zh'` block, line ~162): `{sentence.romanization}`
- Input view (`direction === 'zh-to-en'` block, line ~213): `{sentence.romanization}`

**d) Add `caps` prop and replace `ChineseInput` with `LanguageInput` for `en-to-zh` direction:**
```tsx
import type { LanguageCapabilities } from '@/lib/language-caps'
import { LanguageInput } from '@/components/ui/LanguageInput'

interface Props {
  sentence: Sentence
  direction: 'en-to-zh' | 'zh-to-en'
  progress?: string
  onNext: (correct: boolean) => void
  caps: LanguageCapabilities    // new
}

// In the input form view, replace:
{direction === 'en-to-zh'
  ? <ChineseInput value={value} onChange={e => setValue(e.target.value)} ... />
  : <input ... />}
// With:
{direction === 'en-to-zh'
  ? <LanguageInput inputMode={caps.inputMode} value={value} onChange={e => setValue(e.target.value)} ... />
  : <input ... />}
```

- [ ] **Step 5: Update `ShadowingDictationPhase.tsx`**

Add `caps: LanguageCapabilities` prop. Replace `<ChineseInput>` with `<LanguageInput>`:

```tsx
import type { LanguageCapabilities } from '@/lib/language-caps'
import { LanguageInput } from '@/components/ui/LanguageInput'
// Remove: import { ChineseInput } from '@/components/ui/ChineseInput'

interface ShadowingDictationPhaseProps {
  segment: Segment
  segmentLabel: string
  progress: number
  onSubmit: (answer: string) => void
  onSkip: () => void
  onExit: () => void
  caps: LanguageCapabilities    // new
}

// In render, replace:
<ChineseInput
  value={value}
  onChange={e => setValue(e.target.value)}
  onKeyDown={handleKeyDown}
  placeholder="输入汉字…"
  className={cn('h-12 text-center text-xl ...', shake && '...')}
  aria-label="Your answer"
/>
// With:
<LanguageInput
  inputMode={caps.inputMode}
  value={value}
  onChange={e => setValue(e.target.value)}
  onKeyDown={handleKeyDown}
  placeholder={caps.dictationPlaceholder}
  className={cn('h-12 text-center text-xl ...', shake && '...')}
  aria-label="Your answer"
/>
```

- [ ] **Step 6: Update `backend/app/routers/translation_exercise.py`**

The `/api/translation/generate` endpoint currently has `source_language: Literal['chinese', 'english']`. Since `TranslationExercise.tsx` will send `caps.languageName.toLowerCase()` (e.g. `'english'`, `'chinese'`, `'japanese'`), the backend must accept arbitrary language name strings:

```bash
grep -n "source_language\|target_language\|Literal" backend/app/routers/translation_exercise.py | head -10
```

Update the request model (around line 92):
```python
# Before:
source_language: Literal['chinese', 'english']
target_language: Literal['chinese', 'english']

# After:
source_language: str    # e.g. 'chinese', 'english', 'japanese'
target_language: str
```

The prompt builder (line ~113) uses `req.source_language` and `req.target_language` directly in the string already — no prompt change needed.

- [ ] **Step 7: TypeScript check for exercise files**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "exercises/\|ShadowingDictation" | head -30
```

Expected: Errors only about missing `caps` prop being passed from parent components (fixed in Task 12).

- [ ] **Step 8: Commit**

```bash
git add \
  frontend/src/components/study/exercises/CharacterWritingExercise.tsx \
  frontend/src/components/study/exercises/DictationExercise.tsx \
  frontend/src/components/study/exercises/ReconstructionExercise.tsx \
  frontend/src/components/study/exercises/TranslationExercise.tsx \
  frontend/src/components/shadowing/ShadowingDictationPhase.tsx \
  backend/app/routers/translation_exercise.py
git commit -m "feat(exercises): add LanguageCapabilities prop, LanguageInput, field renames, and fix translation_exercise backend"
```

---

### Task 12: useQuizGeneration + StudySession + ShadowingPanel (caps threading)

**Files:**
- Modify: `frontend/src/hooks/useQuizGeneration.ts`
- Modify: `frontend/src/components/study/StudySession.tsx`
- Modify: `frontend/src/components/shadowing/ShadowingPanel.tsx`
- Delete: `frontend/src/components/study/exercises/PinyinRecallExercise.tsx`

This task wires `LanguageCapabilities` from lesson metadata through all orchestrator components down to exercises.

- [ ] **Step 1: Update `useQuizGeneration.ts`**

**a) Rename `pinyin` → `romanization` in `wordMap`:**
```typescript
const wordMap = (entries: VocabEntry[]) =>
  entries.map(e => ({ word: e.word, romanization: e.romanization, meaning: e.meaning, usage: e.usage }))
```

**b) Add `sourceLanguage` parameter to `generateQuiz`:**
```typescript
const generateQuiz = useCallback(async function generateQuiz(
  types: Exclude<ExerciseMode, 'mixed'>[],
  pool: VocabEntry[],
  signal: AbortSignal,
  sourceLanguage: string = 'zh-CN',    // new
) {
```

**c) Pass `source_language` in both quiz API calls:**
```typescript
body: JSON.stringify({
  openrouter_api_key: keys?.openrouterApiKey,
  words: wordMap(pool.slice(0, 5)),
  exercise_type: 'cloze',
  story_count: clozeCount,
  source_language: sourceLanguage,    // new
}),
// ... same for pronunciation_sentence call
```

**d) Update `TranslationResult` type and map from API response at the boundary:**

The `/api/translation/generate` backend endpoint still returns `{ sentences: [{ chinese, pinyin, english }] }`. Map to the renamed `Sentence` interface when receiving the response:

```typescript
type TranslationResult = { sentences: { text: string, romanization: string, english: string }[] } | null

// In the translation API calls:
...translationEntries.map(entry =>
  fetch(`${API_BASE}/api/translation/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      openrouter_api_key: keys?.openrouterApiKey,
      word: entry.word,
      pinyin: entry.romanization,    // backend still expects "pinyin" key
      meaning: entry.meaning,
      usage: entry.usage ?? '',
      sentence_count: 3,
    }),
    signal,
  }).then(r =>
    r.ok
      ? r.json().then((d: { sentences: { chinese: string, pinyin: string, english: string }[] }) => ({
          sentences: d.sentences.map(s => ({
            text: s.chinese,
            romanization: s.pinyin ?? '',
            english: s.english,
          })),
        }))
      : Promise.reject(),
  ).catch(() => null),
),
```

**e) Update `UseQuizGenerationReturn` interface signature:**
```typescript
interface UseQuizGenerationReturn {
  generateQuiz: (
    types: Exclude<ExerciseMode, 'mixed'>[],
    pool: VocabEntry[],
    signal: AbortSignal,
    sourceLanguage?: string,
  ) => Promise<{
    clozeExercises: ClozeExerciseData[]
    pronExercises: PronExerciseData[]
    translationResults: TranslationResult[]
  }>
  loading: boolean
}
```

- [ ] **Step 2: Update `StudySession.tsx`**

**a) Add imports:**
```typescript
import type { LanguageCapabilities } from '@/lib/language-caps'
import { getLanguageCaps } from '@/lib/language-caps'
import { RomanizationRecallExercise } from '@/components/study/exercises/RomanizationRecallExercise'
// Remove: import { PinyinRecallExercise } from '@/components/study/exercises/PinyinRecallExercise'
```

**b) Derive `caps` from entry sourceLanguage:**
```typescript
// After: const entries = entriesByLesson[lessonId] ?? []
const sourceLanguage = entries[0]?.sourceLanguage ?? 'zh-CN'
const caps = getLanguageCaps(sourceLanguage)
```

**c) Update `Question.translationData` interface:**
```typescript
translationData?: {
  sentence: { text: string, romanization: string, english: string }   // was: chinese/pinyin
  direction: 'en-to-zh' | 'zh-to-en'
}
```

**d) Update `getReconstructionTokens`:**
```typescript
function getReconstructionTokens(entry: VocabEntry, allEntries: VocabEntry[]): string[] {
  const segWords = allEntries
    .filter(e => e.sourceSegmentId === entry.sourceSegmentId)
    .map(e => e.word)
    .filter(w => entry.sourceSegmentText.includes(w))    // was: sourceSegmentChinese
  return [...new Set(segWords)]
}
```

**e) Update `distributeExercises` to accept and use `caps`:**
```typescript
function distributeExercises(
  _entries: VocabEntry[],
  mode: ExerciseMode,
  count: number,
  hasAzure: boolean,
  caps: LanguageCapabilities,
  hasOpenRouter: boolean,
): Exclude<ExerciseMode, 'mixed'>[] {
  const available: Exclude<ExerciseMode, 'mixed'>[] = ['dictation', 'reconstruction']

  if (caps.romanizationSystem !== 'none') available.push('romanization-recall')

  const hasWriting = caps.hasCharacterWriting && _entries.some(e =>
    [...e.word].some(isWritingSupported)
  )
  if (hasWriting) available.push('writing')
  if (hasAzure) available.push('pronunciation')
  if (hasOpenRouter) {
    available.push('cloze')
    available.push('translation')
  }
  // rest of distribution logic unchanged
}
```

Update the call site inside `handleStart`:
```typescript
const types = distributeExercises(entries, mode, count, hasAzure, caps, Boolean(keys?.openrouterApiKey))
```

**f) Update fallback path (rename `'pinyin'` → `'romanization-recall'`):**
```typescript
const fallbackTypes = types.map(t =>
  (t === 'cloze' || t === 'translation') ? 'romanization-recall' : t
) as Exclude<ExerciseMode, 'mixed'>[]
```

**g) Update render condition `q.type === 'pinyin'` → `q.type === 'romanization-recall'` and component:**
```tsx
{q.type === 'romanization-recall' && (    // was: q.type === 'pinyin'
  <RomanizationRecallExercise             // was: PinyinRecallExercise
    key={current}
    entry={q.entry}
    progress={`${current + 1} / ${questions.length}`}
    onNext={handleNext}
    playTTS={playTTS}
    caps={caps}                           // new
  />
)}
```

**h) Pass `caps` to exercises and `ModePicker`:**
```tsx
<ModePicker
  selected={mode}
  onSelect={setMode}
  count={count}
  loading={loading}
  onCountChange={setCount}
  onStart={() => void handleStart()}
  lessonTitle={lessonTitle}
  caps={caps}           // new
/>
// ...
<CharacterWritingExercise ... caps={caps} />
<DictationExercise ... caps={caps} />
<TranslationExercise ... caps={caps} />
```

**i) Pass `sourceLanguage` to `generateQuiz`:**
```typescript
const { clozeExercises, pronExercises, translationResults } = await generateQuiz(
  types, pool, controller.signal, sourceLanguage
)
```

**j) Delete `PinyinRecallExercise.tsx`:**
```bash
rm frontend/src/components/study/exercises/PinyinRecallExercise.tsx
```

- [ ] **Step 3: Update `ShadowingPanel.tsx`**

Per spec, add `lesson: LessonMeta` prop (rather than a raw string), derive `caps`, pass to `ShadowingDictationPhase`:

```typescript
import type { LessonMeta } from '@/types'
import { getLanguageCaps } from '@/lib/language-caps'

interface ShadowingPanelProps {
  segments: Segment[]
  mode: 'dictation' | 'speaking'
  azureKey: string
  azureRegion: string
  onExit: () => void
  lesson: LessonMeta    // new — provides sourceLanguage for caps derivation
}

export function ShadowingPanel({ segments, mode, azureKey, azureRegion, onExit, lesson }: ShadowingPanelProps) {
  const caps = getLanguageCaps(lesson.sourceLanguage)
  // ...
  // Pass to ShadowingDictationPhase:
  <ShadowingDictationPhase
    segment={segment}
    segmentLabel={segmentLabel}
    progress={progress}
    onSubmit={handleDictationSubmit}
    onSkip={handleSkip}
    onExit={handleExitRequest}
    caps={caps}     // new
  />
```

`ShadowingPanel` is rendered in `frontend/src/components/lesson/LessonView.tsx` (line ~167). Update that call site to pass `lesson={meta}` (the `LessonMeta` already loaded in that component):

```tsx
// In LessonView.tsx:
<ShadowingPanel
  segments={segments}
  mode={shadowingMode}
  azureKey={keys?.azureSpeechKey ?? ''}
  azureRegion={keys?.azureSpeechRegion ?? ''}
  onExit={handleShadowingExit}
  lesson={meta}    // new — was: no lesson prop
/>
```

- [ ] **Step 4: Full TypeScript check — should reach zero errors**

```bash
cd frontend && npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 5: Run frontend tests, fix failures**

```bash
cd frontend && npx vitest run
```

Common failures to expect and fix:
- `StudySession.test.tsx`: update `'pinyin'` → `'romanization-recall'` in any mode string assertions
- `useVocabulary.test.ts`: update `sourceSegmentChinese` → `sourceSegmentText`, `pinyin` → `romanization` in any fixtures

- [ ] **Step 6: Commit**

```bash
git add \
  frontend/src/hooks/useQuizGeneration.ts \
  frontend/src/components/study/StudySession.tsx \
  frontend/src/components/shadowing/ShadowingPanel.tsx \
  frontend/tests/StudySession.test.tsx \
  frontend/tests/useVocabulary.test.ts
git rm frontend/src/components/study/exercises/PinyinRecallExercise.tsx
git commit -m "feat(study): wire LanguageCapabilities through StudySession, ShadowingPanel, and quiz generation; delete PinyinRecallExercise"
```

---

### Task 13: Final verification

Run all tests, confirm TypeScript is clean, do a manual smoke test.

- [ ] **Step 1: Backend full test suite**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: All PASS

- [ ] **Step 2: Frontend TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: Zero errors

- [ ] **Step 3: Frontend full test suite**

```bash
cd frontend && npx vitest run
```

Expected: All PASS

- [ ] **Step 4: Manual smoke test**

1. Start backend: `cd backend && uvicorn app.main:app --reload`
2. Start frontend: `cd frontend && npm run dev`
3. Create an **English** lesson (source language = `en`):
   - Transcript: no romanization shown (empty string guard works)
   - Shadowing reveal: no romanization line shown
4. Open study session for the English lesson:
   - ModePicker shows **IPA Recall** (not Pinyin Recall), no **Write** card
5. Run **Dictation** exercise for English: plain text input (no IME candidate overlay)
6. Run **IPA Recall** exercise: can type IPA text, comparison works
7. Open a **Chinese** lesson and verify no regression:
   - Transcript shows pinyin below characters
   - Shadowing reveal shows pinyin
   - ModePicker shows **Pinyin Recall** and **Write** cards
   - Dictation uses ChineseInput (IME)
   - Workbook: pinyin shown on word cards

- [ ] **Step 5: Commit any final fixes**

```bash
git add -p
git commit -m "fix: final verification adjustments for multi-language support"
```
