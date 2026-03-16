# Source Language Selection Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users select the language of their video so Deepgram uses the correct language instead of hardcoded `zh-CN`.

**Architecture:** Thread a `source_language` string from a new frontend selector → API request → background pipeline → `transcribe_audio_deepgram()`. Fix conditional space-stripping in segmentation helpers so non-CJK transcriptions have correct word spacing. Extract the language list to a shared frontend constant.

**Tech Stack:** FastAPI (Pydantic models, Form params), Python async, React + TypeScript, shadcn/ui Select component, IndexedDB (via idb).

**Spec:** `docs/superpowers/specs/2026-03-16-source-language-selection-design.md`

---

## File Map

| File | Change |
|---|---|
| `frontend/src/lib/constants.ts` | **Create** — shared `LANGUAGES` constant |
| `frontend/src/types.ts` | Modify — add `sourceLanguage?` to `LessonMeta` |
| `frontend/src/components/create/CreateLesson.tsx` | Modify — import `LANGUAGES`, add selector + state, pass in submits |
| `backend/app/models.py` | Modify — add `source_language` to `LessonRequest` |
| `backend/app/services/transcription.py` | Modify — `_finalize_segment`, `_group_words_into_segments`, `_segments_from_utterances`, `transcribe_audio_deepgram` |
| `backend/app/routers/lessons.py` | Modify — upload endpoint + `_process_upload_lesson` + both pipeline call sites |
| `backend/tests/test_transcription.py` | Modify — add `_finalize_segment` import, update 2 `_group_words` + 4 `_segments_from_utterances` + 3 `transcribe_audio_deepgram` call sites, add 6 new helper tests |

---

## Chunk 1: Backend transcription service

### Task 1: Fix `_finalize_segment` — add `language`, conditional space-join

**Files:**
- Modify: `backend/app/services/transcription.py:92-101`
- Test: `backend/tests/test_transcription.py`

Background: `_finalize_segment` currently does `"".join(w["text"] for w in words)` which concatenates English words without spaces (e.g. `"Helloworld."` instead of `"Hello world."`). The fix: always join with a space, then strip spaces only for Chinese (`language.startswith("zh")`).

- [ ] **Step 1: Write the failing test**

First, add `_finalize_segment` to the existing import block at the top of `backend/tests/test_transcription.py` (lines 5–10):

```python
from app.services.transcription import (
    _finalize_segment,
    _group_words_into_segments,
    _segments_from_utterances,
    transcribe_audio_deepgram,
    _normalize_deepgram_words,
)
```

Then add these tests at the bottom of the file:

```python
def test_finalize_segment_english_preserves_spaces():
    """Non-CJK words must be joined with spaces, not concatenated."""
    words = [
        {"text": "Hello", "start": 0.0, "end": 0.5},
        {"text": "world.", "start": 0.5, "end": 1.0},
    ]
    seg = _finalize_segment(words, 0, language="en")
    assert seg["text"] == "Hello world."


def test_finalize_segment_chinese_strips_spaces():
    """CJK tokens must be joined without spaces."""
    words = [
        {"text": "你好", "start": 0.0, "end": 0.5},
        {"text": "世界。", "start": 0.5, "end": 1.0},
    ]
    seg = _finalize_segment(words, 0, language="zh-CN")
    assert seg["text"] == "你好世界。"
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/ross-geller/Projects/personal/shadowing-companion/backend
python -m pytest tests/test_transcription.py::test_finalize_segment_english_preserves_spaces tests/test_transcription.py::test_finalize_segment_chinese_strips_spaces -v
```

Expected: FAIL — `_finalize_segment` currently takes 2 args, not 3.

- [ ] **Step 3: Implement the fix**

In `backend/app/services/transcription.py`, replace `_finalize_segment`:

```python
def _finalize_segment(words: list[_Word], index: int, language: str) -> _Segment:
    """Create a segment dict from a list of word dicts."""
    text = " ".join(w["text"] for w in words)
    if language.startswith("zh"):
        text = text.replace(" ", "")
    return {
        "id": index,
        "start": words[0]["start"],
        "end": words[-1]["end"],
        "text": text,
        "word_timings": list(words),
    }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /home/ross-geller/Projects/personal/shadowing-companion/backend
python -m pytest tests/test_transcription.py::test_finalize_segment_english_preserves_spaces tests/test_transcription.py::test_finalize_segment_chinese_strips_spaces -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/transcription.py backend/tests/test_transcription.py
git commit -m "fix(transcription): _finalize_segment — conditional space-join for non-CJK"
```

---

### Task 2: Fix `_group_words_into_segments` — add `language`, fix length measurement, forward to `_finalize_segment`

**Files:**
- Modify: `backend/app/services/transcription.py:104-148`

Background: `_group_words_into_segments` calls `_finalize_segment` (which now requires `language`) and also computes `current_text = "".join(...)` for segment-length thresholds. For non-CJK languages that join underestimates length (misses spaces). Apply the same conditional logic.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_transcription.py`:

```python
def test_group_words_english_preserves_spaces():
    """Word fallback path must join English words with spaces."""
    words = [
        {"text": "Hello", "start": 0.0, "end": 0.5},
        {"text": "world.", "start": 0.5, "end": 1.0},
    ]
    segments = _group_words_into_segments(words, language="en")
    assert len(segments) == 1
    assert segments[0]["text"] == "Hello world."


def test_group_words_chinese_strips_spaces():
    """Word fallback path must strip spaces for CJK."""
    words = [
        {"text": "你好", "start": 0.0, "end": 0.5},
        {"text": "世界。", "start": 0.5, "end": 1.0},
    ]
    segments = _group_words_into_segments(words, language="zh-CN")
    assert len(segments) == 1
    assert segments[0]["text"] == "你好世界。"
```

- [ ] **Step 2: Update existing `_group_words_into_segments` call sites in the test file**

The two existing tests at lines 20 and 37 call `_group_words_into_segments(words)` without a `language` argument. Add `language="zh-CN"` to both (the test data is Chinese so behaviour is unchanged):

- Line 20: `segments = _group_words_into_segments(words, language="zh-CN")`
- Line 37: `segments = _group_words_into_segments(words, language="zh-CN")`

- [ ] **Step 3: Run tests to confirm new tests fail, existing still pass**

```bash
cd /home/ross-geller/Projects/personal/shadowing-companion/backend
python -m pytest tests/test_transcription.py::test_group_words_english_preserves_spaces tests/test_transcription.py::test_group_words_chinese_strips_spaces -v
```

Expected: FAIL — `_group_words_into_segments` takes 1 arg, not 2.

- [ ] **Step 4: Implement the fix**

Replace `_group_words_into_segments` in `backend/app/services/transcription.py`:

```python
def _group_words_into_segments(words: list[_Word], language: str) -> list[_Segment]:
    """Group a flat word list into sentence segments.

    Splits on sentence-ending punctuation or time gaps.
    Used as fallback when Deepgram utterance data is absent.
    """
    segments: list[_Segment] = []
    current_words: list[_Word] = []
    segment_index = 0

    for word in words:
        text = word["text"]

        if not current_words:
            current_words.append(word)
        else:
            prev_end = current_words[-1]["end"]
            gap = word["start"] - prev_end

            if gap > _GAP_THRESHOLD_SECONDS:
                segments.append(_finalize_segment(current_words, segment_index, language))
                segment_index += 1
                current_words = [word]
            else:
                current_words.append(word)

        current_text = " ".join(w["text"] for w in current_words)
        if language.startswith("zh"):
            current_text = current_text.replace(" ", "")

        if text.rstrip() and text[-1] in _SENTENCE_ENDINGS:
            segments.append(_finalize_segment(current_words, segment_index, language))
            segment_index += 1
            current_words = []
        elif text.rstrip() and text[-1] in _CLAUSE_BREAKS and len(current_text) >= _MAX_SEGMENT_CHARS:
            segments.append(_finalize_segment(current_words, segment_index, language))
            segment_index += 1
            current_words = []
        elif len(current_text) >= int(_MAX_SEGMENT_CHARS * 1.5):
            segments.append(_finalize_segment(current_words, segment_index, language))
            segment_index += 1
            current_words = []

    if current_words:
        segments.append(_finalize_segment(current_words, segment_index, language))

    return segments
```

- [ ] **Step 5: Run tests**

```bash
cd /home/ross-geller/Projects/personal/shadowing-companion/backend
python -m pytest tests/test_transcription.py::test_group_words_english_preserves_spaces tests/test_transcription.py::test_group_words_chinese_strips_spaces tests/test_transcription.py::test_group_words_splits_on_punctuation tests/test_transcription.py::test_group_words_splits_on_gap -v
```

Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/transcription.py backend/tests/test_transcription.py
git commit -m "fix(transcription): _group_words_into_segments — language param, conditional space-join"
```

---

### Task 3: Fix `_segments_from_utterances` — add `language`, conditional space-strip

**Files:**
- Modify: `backend/app/services/transcription.py:152-179`

Background: The utterance path unconditionally strips all spaces from transcript text. This is correct for CJK (Deepgram inserts spaces between CJK tokens) but corrupts space-separated languages.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_transcription.py`:

```python
def test_segments_from_utterances_english_preserves_spaces():
    """Utterance transcripts for non-CJK must keep word spaces."""
    utterances = [
        {
            "start": 0.0, "end": 1.0,
            "transcript": "Hello world.",
            "words": [
                {"word": "Hello", "punctuated_word": "Hello", "start": 0.0, "end": 0.5,
                 "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
                {"word": "world", "punctuated_word": "world.", "start": 0.5, "end": 1.0,
                 "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
            ],
            "speaker": 0, "id": "u1", "channel": 0, "confidence": 0.99,
        }
    ]
    segments = _segments_from_utterances(utterances, language="en")
    assert segments[0]["text"] == "Hello world."


def test_segments_from_utterances_chinese_strips_spaces():
    """Utterance transcripts for CJK must have spaces stripped."""
    utterances = [
        {
            "start": 0.0, "end": 1.0,
            "transcript": "你好 世界。",
            "words": [],
            "speaker": 0, "id": "u1", "channel": 0, "confidence": 0.99,
        }
    ]
    segments = _segments_from_utterances(utterances, language="zh-CN")
    assert segments[0]["text"] == "你好世界。"
```

- [ ] **Step 2: Update the four existing `_segments_from_utterances` call sites in the test file**

The four existing tests call `_segments_from_utterances(utterances)` without a `language` argument. All use Chinese test data, so adding `language="zh-CN"` preserves their behaviour:

- Line 83: `segments = _segments_from_utterances(utterances, language="zh-CN")`
- Line 108: `segments = _segments_from_utterances(utterances, language="zh-CN")`
- Line 127: `segments = _segments_from_utterances(utterances, language="zh-CN")`
- Line 153: `segments = _segments_from_utterances(utterances, language="zh-CN")`

- [ ] **Step 3: Run tests to confirm new tests fail**

```bash
cd /home/ross-geller/Projects/personal/shadowing-companion/backend
python -m pytest tests/test_transcription.py::test_segments_from_utterances_english_preserves_spaces tests/test_transcription.py::test_segments_from_utterances_chinese_strips_spaces -v
```

Expected: FAIL — function takes 1 arg, not 2.

- [ ] **Step 4: Implement the fix**

Replace `_segments_from_utterances` in `backend/app/services/transcription.py`:

```python
def _segments_from_utterances(utterances: list[_DeepgramUtterance], language: str) -> list[_Segment]:
    """Convert Deepgram utterance objects to segments.

    Each utterance becomes one segment. Deepgram inserts spaces between CJK tokens
    in transcript text (e.g. "你 在 学 什 么"). Strip spaces only for Chinese to
    produce clean output without corrupting space-separated languages.
    """
    segments: list[_Segment] = []
    for i, utt in enumerate(utterances):
        text = utt["transcript"]
        if language.startswith("zh"):
            text = text.replace(" ", "")
        if not text:
            continue
        word_timings: list[_WordTiming] = [
            {
                "text": w.get("punctuated_word") or w["word"],
                "start": w["start"],
                "end": w["end"],
            }
            for w in utt.get("words", [])
        ]
        segments.append({
            "id": i,
            "start": utt["start"],
            "end": utt["end"],
            "text": text,
            "word_timings": word_timings,
        })
    return segments
```

- [ ] **Step 5: Run all utterance-related tests**

```bash
cd /home/ross-geller/Projects/personal/shadowing-companion/backend
python -m pytest tests/test_transcription.py::test_segments_from_utterances_english_preserves_spaces tests/test_transcription.py::test_segments_from_utterances_chinese_strips_spaces tests/test_transcription.py::test_segments_from_utterances_strips_spaces_and_assigns_ids tests/test_transcription.py::test_segments_from_utterances_uses_punctuated_word tests/test_transcription.py::test_segments_from_utterances_skips_empty tests/test_transcription.py::test_segments_from_utterances_multiple -v
```

Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/transcription.py backend/tests/test_transcription.py
git commit -m "fix(transcription): _segments_from_utterances — conditional space-strip for CJK only"
```

---

### Task 4: Update `transcribe_audio_deepgram` — add `language` param, remove hardcoded language from `_DEEPGRAM_PARAMS`

**Files:**
- Modify: `backend/app/services/transcription.py:186-287`
- Test: `backend/tests/test_transcription.py`

Background: The `_DEEPGRAM_PARAMS` module-level dict has `"language": "zh-CN"` hardcoded. Remove it from the dict and build params locally inside the function. Update the function signature to accept `language: str`. Thread `language` down to both `_segments_from_utterances` and `_group_words_into_segments`.

Note: `transcribe_audio_deepgram` is called from `lessons.py` — those call sites will get a type error until Task 6. That's expected and fine until then.

- [ ] **Step 1: Update the three existing test call sites**

In `backend/tests/test_transcription.py`, find the three calls to `transcribe_audio_deepgram` and add `language="zh-CN"` to each:

- Line 220: `segments = await transcribe_audio_deepgram(audio_file, api_key="test_key", language="zh-CN")`
- Line 276: `segments = await transcribe_audio_deepgram(audio_file, api_key="test_key", language="zh-CN")`
- Line 310: `await transcribe_audio_deepgram(audio_file, api_key="bad_key", language="zh-CN")`

- [ ] **Step 2: Run the three existing tests to confirm they still fail (wrong signature)**

```bash
cd /home/ross-geller/Projects/personal/shadowing-companion/backend
python -m pytest tests/test_transcription.py::test_transcribe_audio_deepgram_uses_utterances tests/test_transcription.py::test_transcribe_audio_deepgram_falls_back_to_words tests/test_transcription.py::test_transcribe_audio_deepgram_raises_on_api_error -v
```

Expected: FAIL (function still takes 2 args at this point).

- [ ] **Step 3: Implement the signature change**

In `backend/app/services/transcription.py`:

1. Remove `"language": "zh-CN"` from `_DEEPGRAM_PARAMS` (leave the other 5 keys)
2. Update `transcribe_audio_deepgram` signature and body:

```python
async def transcribe_audio_deepgram(audio_path: Path, api_key: str, language: str) -> list[_Segment]:
    """Transcribe an audio file using the Deepgram nova-2 API.

    Uses utterance segmentation from Deepgram (speaker-aware, punctuated).
    Falls back to word-level grouping if utterance data is absent.
    Returns a list of segment dicts with keys: id, start, end, text, word_timings.
    """
    file_size = audio_path.stat().st_size
    logger.info("Transcribing %s (%.1f MB) with Deepgram nova-2", audio_path.name, file_size / 1024 / 1024)

    if file_size == 0:
        raise ValueError(f"Audio file is empty (0 bytes): {audio_path.name}")

    suffix = audio_path.suffix.lower().lstrip(".")
    _MIME_MAP = {"mp3": "audio/mpeg", "mp4": "audio/mp4", "m4a": "audio/mp4", "wav": "audio/wav", "ogg": "audio/ogg"}
    content_type = _MIME_MAP.get(suffix, f"audio/{suffix}") if suffix else "audio/mpeg"

    audio_bytes = await asyncio.to_thread(audio_path.read_bytes)
    params = {**_DEEPGRAM_PARAMS, "language": language}

    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.post(
            _DEEPGRAM_TRANSCRIPTION_URL,
            params=params,
            headers={
                "Authorization": f"Token {api_key}",
                "Content-Type": content_type,
                "Content-Length": str(file_size),
            },
            content=audio_bytes,
        )

    if response.status_code != 200:
        logger.error("Deepgram API error %d: %s", response.status_code, response.text[:500])
    response.raise_for_status()

    data: _DeepgramResponse = response.json()
    results = data.get("results", {})  # type: ignore[union-attr]

    utterances: list[_DeepgramUtterance] = results.get("utterances", [])  # type: ignore[assignment]
    if utterances:
        segments = _segments_from_utterances(utterances, language)
        logger.info("Deepgram transcription complete: %d segments from utterances", len(segments))
        return segments

    channels = results.get("channels", [])  # type: ignore[call-overload]
    if not channels:
        logger.warning("Deepgram returned no channels — empty transcript")
        return []

    channel = channels[0]
    detected_language = channel.get("detected_language", "unknown")
    language_confidence = channel.get("language_confidence", 0.0)
    logger.info("Deepgram detected language: %s (confidence=%.2f)", detected_language, language_confidence)

    alternative = channel.get("alternatives", [{}])[0]  # type: ignore[call-overload]
    alt_confidence = alternative.get("confidence", 0.0)
    alt_transcript = alternative.get("transcript", "")
    logger.info(
        "Deepgram alternative (word fallback): confidence=%.4f, transcript=%r",
        alt_confidence,
        alt_transcript[:100] if alt_transcript else "(empty)",
    )

    raw_words: list[_DeepgramWord] = alternative.get("words", [])  # type: ignore[assignment]
    if not raw_words:
        logger.warning(
            "Deepgram returned no speech. "
            "detected_language=%s, language_confidence=%.2f, alt_confidence=%.4f, transcript=%r",
            detected_language, language_confidence, alt_confidence,
            alt_transcript[:200] if alt_transcript else "(empty)",
        )
        return []

    logger.info("Deepgram transcription complete (word fallback): %d words", len(raw_words))
    words = _normalize_deepgram_words(raw_words)
    return _group_words_into_segments(words, language)
```

- [ ] **Step 4: Run all transcription tests**

```bash
cd /home/ross-geller/Projects/personal/shadowing-companion/backend
python -m pytest tests/test_transcription.py -v
```

Expected: All 18 tests PASS (9 pre-existing helpers + 6 new helpers + 3 updated `transcribe_audio_deepgram` tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/transcription.py backend/tests/test_transcription.py
git commit -m "feat(transcription): transcribe_audio_deepgram accepts language param, removes hardcoded zh-CN"
```

---

## Chunk 2: Backend models and router

### Task 5: Add `source_language` to `LessonRequest`

**Files:**
- Modify: `backend/app/models.py`

- [ ] **Step 1: Add the field**

In `backend/app/models.py`, in the `LessonRequest` class, add:

```python
source_language: str = "zh-CN"
```

Place it after `deepgram_api_key`. The default of `"zh-CN"` ensures any client that doesn't send the field continues to work as before.

- [ ] **Step 2: Verify no tests break**

```bash
cd /home/ross-geller/Projects/personal/shadowing-companion/backend
python -m pytest -v
```

Expected: All PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/app/models.py
git commit -m "feat(models): add source_language to LessonRequest"
```

---

### Task 6: Thread `source_language` through both pipeline functions in `lessons.py`

**Files:**
- Modify: `backend/app/routers/lessons.py:134,166-292`

This task has two sub-parts: (A) YouTube pipeline, (B) Upload pipeline and endpoint.

#### Part A — YouTube pipeline

- [ ] **Step 1: Pass `request.source_language` to `transcribe_audio_deepgram` in `_process_youtube_lesson`**

In `backend/app/routers/lessons.py` at line 134, change:

```python
segments = await transcribe_audio_deepgram(audio_path, request.deepgram_api_key)
```

to:

```python
segments = await transcribe_audio_deepgram(audio_path, request.deepgram_api_key, request.source_language)
```

#### Part B — Upload pipeline function

- [ ] **Step 2: Add `source_language` as a new sixth parameter to `_process_upload_lesson`**

Change the function signature from:

```python
async def _process_upload_lesson(
    file: UploadFile,
    translation_languages: list[str],
    openrouter_api_key: str,
    job_id: str,
    deepgram_api_key: str | None = None,
) -> None:
```

to:

```python
async def _process_upload_lesson(
    file: UploadFile,
    translation_languages: list[str],
    openrouter_api_key: str,
    job_id: str,
    deepgram_api_key: str | None = None,
    source_language: str = "zh-CN",
) -> None:
```

At line 223, change:

```python
segments = await transcribe_audio_deepgram(audio_path, deepgram_api_key)
```

to:

```python
segments = await transcribe_audio_deepgram(audio_path, deepgram_api_key, source_language)
```

#### Part C — Upload endpoint

- [ ] **Step 3: Add `source_language` Form param to `generate_lesson_upload` and forward it**

Change the endpoint signature from:

```python
async def generate_lesson_upload(
    background_tasks: BackgroundTasks,
    file: UploadFile,
    translation_languages: str = Form(...),
    openrouter_api_key: str = Form(...),
    deepgram_api_key: str | None = Form(None),
) -> dict:
```

to:

```python
async def generate_lesson_upload(
    background_tasks: BackgroundTasks,
    file: UploadFile,
    translation_languages: str = Form(...),
    openrouter_api_key: str = Form(...),
    deepgram_api_key: str | None = Form(None),
    source_language: str = Form("zh-CN"),
) -> dict:
```

Change the `background_tasks.add_task(...)` call to pass `source_language` as the sixth positional argument — `deepgram_api_key` must be passed positionally (not as a keyword argument) so that `source_language` lands in the correct slot:

```python
background_tasks.add_task(
    _process_upload_lesson,
    file,
    languages,
    openrouter_api_key,
    job_id,
    deepgram_api_key,
    source_language,
)
```

- [ ] **Step 4: Run all backend tests**

```bash
cd /home/ross-geller/Projects/personal/shadowing-companion/backend
python -m pytest -v
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/lessons.py
git commit -m "feat(lessons): thread source_language through YouTube and upload pipelines"
```

---

## Chunk 3: Frontend

### Task 7: Create shared `LANGUAGES` constant

**Files:**
- Create: `frontend/src/lib/constants.ts`

- [ ] **Step 1: Create the file**

Create `frontend/src/lib/constants.ts`:

```ts
export const LANGUAGES = [
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
  { value: 'zh-TW', label: 'Chinese (Traditional)' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'vi', label: 'Vietnamese' },
]
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/constants.ts
git commit -m "feat(constants): add shared LANGUAGES constant"
```

---

### Task 8: Add `sourceLanguage` to `LessonMeta` type

**Files:**
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: Add the optional field**

In `frontend/src/types.ts`, find the `LessonMeta` interface and add:

```ts
sourceLanguage?: string
```

Place it after `translationLanguages`. The field is optional for backwards compatibility with lessons already stored in IndexedDB (they won't have this field).

- [ ] **Step 2: Verify the frontend still type-checks**

```bash
cd /home/ross-geller/Projects/personal/shadowing-companion/frontend
npx tsc -b --dry
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat(types): add optional sourceLanguage to LessonMeta"
```

---

### Task 9: Update `CreateLesson.tsx` — import shared constant, add Video Language selector, pass in both submit paths

**Files:**
- Modify: `frontend/src/components/create/CreateLesson.tsx`

- [ ] **Step 1: Replace the local `LANGUAGES` with the shared import and add `sourceLanguage` state**

At the top of the file, add the import:

```ts
import { LANGUAGES } from '@/lib/constants'
```

Remove the local `LANGUAGES` constant (lines 17–27).

Add a new `sourceLanguage` state after the existing `language` state:

```ts
const [sourceLanguage, setSourceLanguage] = useState('zh-CN')
```

- [ ] **Step 2: Add the "Video Language" selector to the form**

In the JSX, add a new `<div className="space-y-2">` block **above** the existing "Translation Language" block:

```tsx
<div className="space-y-2">
  <label className="text-sm font-medium text-white/65">Video Language</label>
  <Select value={sourceLanguage} onValueChange={v => v !== null && setSourceLanguage(v)} items={LANGUAGES}>
    <SelectTrigger className="w-full">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {LANGUAGES.map(l => (
        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

- [ ] **Step 3: Pass `source_language` in both submit paths**

In the YouTube submit (around line 71), add `source_language: sourceLanguage` to the JSON body:

```ts
body: JSON.stringify({
  source: 'youtube',
  youtube_url: youtubeUrl,
  translation_languages: [language],
  source_language: sourceLanguage,
  openrouter_api_key: keys.openrouterApiKey,
  deepgram_api_key: keys.deepgramApiKey ?? null,
}),
```

In the upload submit (around line 98), add:

```ts
formData.append('source_language', sourceLanguage)
```

- [ ] **Step 4: Pass `sourceLanguage` when saving the stub `LessonMeta`**

In the `updateLesson({...})` call (around line 126), add:

```ts
sourceLanguage,
```

alongside the other fields.

- [ ] **Step 5: Add `sourceLanguage` to the `useCallback` dependency array**

In the `useCallback` dependency array at the end of `handleGenerate` (around line 151), add `sourceLanguage`.

- [ ] **Step 6: Type-check and run frontend tests**

```bash
cd /home/ross-geller/Projects/personal/shadowing-companion/frontend
npx tsc -b --dry
npx vitest run
```

Expected: No type errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/create/CreateLesson.tsx frontend/src/lib/constants.ts
git commit -m "feat(create): add Video Language selector, pass source_language to API"
```

---

## Final verification

- [ ] **Run the full backend test suite**

```bash
cd /home/ross-geller/Projects/personal/shadowing-companion/backend
python -m pytest -v
```

Expected: All tests pass.

- [ ] **Run the full frontend test suite**

```bash
cd /home/ross-geller/Projects/personal/shadowing-companion/frontend
npx vitest run
```

Expected: All tests pass.
