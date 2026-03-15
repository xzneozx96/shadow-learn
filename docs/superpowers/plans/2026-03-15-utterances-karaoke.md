# Utterances Pipeline + Karaoke Progress Fill Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch Deepgram transcription to utterances-based segmentation and store per-word timestamps that power a karaoke-style progress fill on the Chinese transcript line.

**Architecture:** The backend adds `word_timings` to each segment via Deepgram's `utterances` response field; `lessons.py` passes them through as `wordTimings` in the JSON payload; the frontend stores them in IndexedDB and a new `SegmentText` component uses them to dim unspoken characters relative to `currentTime`.

**Tech Stack:** Python TypedDict / FastAPI (backend), React + TypeScript + Tailwind + shadcn/ui (frontend), Deepgram nova-2 API, Vitest + pytest

---

## File Map

**Backend — modified:**
- `backend/app/services/transcription.py` — switch from paragraphs to utterances, new TypedDicts, new parser, updated fallback
- `backend/app/routers/lessons.py` — add `wordTimings` to assembled segment dict
- `backend/tests/test_transcription.py` — replace paragraph tests, add utterance tests, update segment shape assertions

**Frontend — modified:**
- `frontend/src/types.ts` — add `WordTiming` interface, add `wordTimings?` to `Segment`
- `frontend/src/components/lesson/TranscriptPanel.tsx` — add `usePlayer`, add `segmentTime` helper, replace `WordTooltip` with `SegmentText`

**Frontend — created:**
- `frontend/src/components/lesson/SegmentText.tsx` — new component: vocab tooltips + karaoke progress fill
- `frontend/tests/SegmentText.test.ts` — unit tests for pure helper functions

**Frontend — deleted:**
- `frontend/src/components/lesson/WordTooltip.tsx` — replaced by `SegmentText`

---

## Chunk 1: Backend — Utterances Pipeline

### Task 1: Update TypedDicts in `transcription.py`

**Files:**
- Modify: `backend/app/services/transcription.py`

This task is pure type-level changes — no new runtime behaviour yet, so no test step.

- [ ] **Step 1: Add `_WordTiming`, update `_Segment`, add `_DeepgramUtterance`, update `_DeepgramResults`, remove paragraph TypedDicts**

In `transcription.py`, make the following changes to the TypedDict block:

```python
# ADD after _Word:
class _WordTiming(TypedDict):
    text: str    # punctuated_word, or word key as fallback
    start: float
    end: float


# REPLACE _Segment (add word_timings field):
class _Segment(TypedDict):
    id: int
    start: float
    end: float
    text: str
    word_timings: list[_WordTiming]


# ADD after _DeepgramWord:
class _DeepgramUtterance(TypedDict):
    start: float
    end: float
    transcript: str
    words: list[_DeepgramWord]
    speaker: int
    id: str
    channel: int
    confidence: float


# REPLACE _DeepgramAlternative (remove paragraphs field):
class _DeepgramAlternative(TypedDict):
    transcript: str
    confidence: float
    words: list[_DeepgramWord]


# REPLACE _DeepgramResults (add utterances field):
class _DeepgramResults(TypedDict):
    channels: list[_DeepgramChannel]
    utterances: list[_DeepgramUtterance]


# DELETE these three TypedDicts entirely:
# _DeepgramSentence
# _DeepgramParagraph
# _DeepgramParagraphsObject
```

- [ ] **Step 2: Commit type-only changes**

```bash
git add backend/app/services/transcription.py
git commit -m "refactor: update transcription TypedDicts for utterances pipeline"
```

---

### Task 2: Write failing tests for new functions

**Files:**
- Modify: `backend/tests/test_transcription.py`

- [ ] **Step 1: Update imports and remove paragraph tests**

Keep `test_transcribe_audio_deepgram_raises_on_api_error` — it tests the 401 HTTP error path and is unaffected by the utterances switch. Do not delete it.

At the top of `test_transcription.py`, replace the import line:
```python
# OLD:
from app.services.transcription import _group_words_into_segments, _segments_from_paragraphs
from app.services.transcription import transcribe_audio_deepgram, _normalize_deepgram_words

# NEW:
from app.services.transcription import (
    _group_words_into_segments,
    _segments_from_utterances,
    transcribe_audio_deepgram,
    _normalize_deepgram_words,
)
```

Delete the four paragraph tests:
- `test_segments_from_paragraphs_strips_spaces_and_assigns_ids`
- `test_segments_from_paragraphs_multiple_sentences_per_paragraph`
- `test_transcribe_audio_deepgram_uses_paragraphs`

- [ ] **Step 2: Add failing tests for `_segments_from_utterances`**

Add after `test_normalize_deepgram_words_fallback_to_word_key`:

```python
def test_segments_from_utterances_strips_spaces_and_assigns_ids():
    """Utterance transcript spaces are stripped; id/start/end match utterance."""
    utterances = [
        {
            "start": 0.24, "end": 1.92, "transcript": "我 的 桌 子",
            "words": [
                {"word": "我", "start": 0.24, "end": 0.48, "punctuated_word": "我",
                 "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
                {"word": "的", "start": 0.72, "end": 0.96, "punctuated_word": "的",
                 "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
                {"word": "桌", "start": 1.12, "end": 1.28, "punctuated_word": "桌",
                 "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
                {"word": "子", "start": 1.44, "end": 1.92, "punctuated_word": "子",
                 "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
            ],
            "speaker": 0, "id": "abc", "channel": 0, "confidence": 0.96,
        }
    ]
    segments = _segments_from_utterances(utterances)
    assert len(segments) == 1
    assert segments[0]["id"] == 0
    assert segments[0]["text"] == "我的桌子"
    assert segments[0]["start"] == 0.24
    assert segments[0]["end"] == 1.92
    assert len(segments[0]["word_timings"]) == 4
    assert segments[0]["word_timings"][0] == {"text": "我", "start": 0.24, "end": 0.48}
    assert segments[0]["word_timings"][3] == {"text": "子", "start": 1.44, "end": 1.92}


def test_segments_from_utterances_uses_punctuated_word():
    """punctuated_word is preferred over word key for word_timing text."""
    utterances = [
        {
            "start": 0.0, "end": 1.0, "transcript": "你 好。",
            "words": [
                {"word": "你", "start": 0.0, "end": 0.4, "punctuated_word": "你",
                 "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
                {"word": "好", "start": 0.5, "end": 1.0, "punctuated_word": "好。",
                 "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
            ],
            "speaker": 0, "id": "xyz", "channel": 0, "confidence": 0.99,
        }
    ]
    segments = _segments_from_utterances(utterances)
    assert segments[0]["text"] == "你好。"
    assert segments[0]["word_timings"][1]["text"] == "好。"


def test_segments_from_utterances_skips_empty():
    """Utterances with empty transcript after space-stripping are skipped."""
    utterances = [
        {"start": 0.0, "end": 0.1, "transcript": " ", "words": [],
         "speaker": 0, "id": "a", "channel": 0, "confidence": 0.0},
        {"start": 1.0, "end": 2.0, "transcript": "你 好",
         "words": [
             {"word": "你", "start": 1.0, "end": 1.4, "punctuated_word": "你",
              "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
             {"word": "好", "start": 1.5, "end": 2.0, "punctuated_word": "好",
              "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
         ],
         "speaker": 0, "id": "b", "channel": 0, "confidence": 0.99},
    ]
    segments = _segments_from_utterances(utterances)
    assert len(segments) == 1
    assert segments[0]["text"] == "你好"
    assert segments[0]["id"] == 1  # utterance-positional: empty utterance at index 0 was skipped


def test_segments_from_utterances_multiple():
    """Multiple utterances produce multiple segments with sequential ids."""
    utterances = [
        {"start": 0.0, "end": 1.0, "transcript": "你 好",
         "words": [
             {"word": "你", "start": 0.0, "end": 0.5, "punctuated_word": "你",
              "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
             {"word": "好", "start": 0.6, "end": 1.0, "punctuated_word": "好",
              "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
         ],
         "speaker": 0, "id": "a", "channel": 0, "confidence": 0.99},
        {"start": 2.0, "end": 3.0, "transcript": "再 见",
         "words": [
             {"word": "再", "start": 2.0, "end": 2.4, "punctuated_word": "再",
              "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
             {"word": "见", "start": 2.5, "end": 3.0, "punctuated_word": "见",
              "speaker": 0, "speaker_confidence": 0.9, "confidence": 0.9},
         ],
         "speaker": 0, "id": "b", "channel": 0, "confidence": 0.99},
    ]
    segments = _segments_from_utterances(utterances)
    assert len(segments) == 2
    assert segments[0]["id"] == 0
    assert segments[1]["id"] == 1
    assert segments[1]["text"] == "再见"
```

- [ ] **Step 3: Update `test_group_words_splits_*` to include `word_timings` in expected output**

The two existing gap/punctuation tests assert on segment shape. Add `word_timings` checks:

```python
def test_group_words_splits_on_punctuation():
    """Words with sentence-ending punctuation split into segments."""
    words = [
        {"text": "你好", "start": 0.0, "end": 0.5},
        {"text": "。", "start": 0.5, "end": 0.5},
        {"text": "世界", "start": 1.0, "end": 1.5},
    ]
    segments = _group_words_into_segments(words)
    assert len(segments) == 2
    assert segments[0]["text"] == "你好。"
    assert segments[0]["word_timings"] == [
        {"text": "你好", "start": 0.0, "end": 0.5},
        {"text": "。", "start": 0.5, "end": 0.5},
    ]
    assert segments[1]["text"] == "世界"
    assert segments[1]["word_timings"] == [{"text": "世界", "start": 1.0, "end": 1.5}]


def test_group_words_splits_on_gap():
    """Words with > 1.5s gap split into segments."""
    words = [
        {"text": "你", "start": 0.0, "end": 0.5},
        {"text": "好", "start": 3.1, "end": 3.6},
    ]
    segments = _group_words_into_segments(words)
    assert len(segments) == 2
    assert segments[0]["text"] == "你"
    assert segments[0]["word_timings"] == [{"text": "你", "start": 0.0, "end": 0.5}]
    assert segments[1]["text"] == "好"
    assert segments[1]["word_timings"] == [{"text": "好", "start": 3.1, "end": 3.6}]
```

- [ ] **Step 4: Add fallback integration test and update existing integration tests**

Replace `test_transcribe_audio_deepgram_uses_paragraphs` with an utterances version, and update `test_transcribe_audio_deepgram_falls_back_to_words`:

```python
@pytest.mark.asyncio
async def test_transcribe_audio_deepgram_uses_utterances(tmp_path):
    """When utterances are present, they are used as the primary segment source."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio data")

    mock_json = {
        "results": {
            "channels": [{
                "detected_language": "zh",
                "language_confidence": 0.99,
                "alternatives": [{
                    "transcript": "你好世界。谢谢你！",
                    "confidence": 0.99,
                    "words": [],
                }],
            }],
            "utterances": [
                {
                    "start": 0.0, "end": 1.0,
                    "transcript": "你好 世界。",
                    "words": [
                        {"word": "你好", "start": 0.0, "end": 0.5,
                         "punctuated_word": "你好", "speaker": 0,
                         "speaker_confidence": 0.9, "confidence": 0.9},
                        {"word": "世界", "start": 0.5, "end": 1.0,
                         "punctuated_word": "世界。", "speaker": 0,
                         "speaker_confidence": 0.9, "confidence": 0.9},
                    ],
                    "speaker": 0, "id": "u1", "channel": 0, "confidence": 0.99,
                },
                {
                    "start": 3.0, "end": 4.0,
                    "transcript": "谢谢 你！",
                    "words": [
                        {"word": "谢谢", "start": 3.0, "end": 3.5,
                         "punctuated_word": "谢谢", "speaker": 1,
                         "speaker_confidence": 0.9, "confidence": 0.9},
                        {"word": "你", "start": 3.5, "end": 4.0,
                         "punctuated_word": "你！", "speaker": 1,
                         "speaker_confidence": 0.9, "confidence": 0.9},
                    ],
                    "speaker": 1, "id": "u2", "channel": 0, "confidence": 0.99,
                },
            ],
        },
    }

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = mock_json
    mock_response.raise_for_status = MagicMock()

    with patch("app.services.transcription.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        segments = await transcribe_audio_deepgram(audio_file, api_key="test_key")

    assert len(segments) == 2
    assert segments[0]["text"] == "你好世界。"
    assert segments[0]["start"] == 0.0
    assert segments[0]["word_timings"][1]["text"] == "世界。"
    assert segments[1]["text"] == "谢谢你！"
    assert segments[1]["start"] == 3.0


@pytest.mark.asyncio
async def test_transcribe_audio_deepgram_falls_back_to_words(tmp_path):
    """Without utterances, falls back to word-level grouping with word_timings."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio data")

    mock_json = {
        "results": {
            "channels": [{
                "detected_language": "zh",
                "language_confidence": 0.99,
                "alternatives": [{
                    "transcript": "你好世界。",
                    "confidence": 0.99,
                    "words": [
                        {"word": "你好", "start": 0.0, "end": 0.5,
                         "punctuated_word": "你好", "speaker": 0,
                         "speaker_confidence": 0.9},
                        {"word": "世界", "start": 0.5, "end": 1.0,
                         "punctuated_word": "世界。", "speaker": 0,
                         "speaker_confidence": 0.9},
                        {"word": "谢谢", "start": 3.0, "end": 3.5,
                         "punctuated_word": "谢谢", "speaker": 1,
                         "speaker_confidence": 0.9},
                        {"word": "你", "start": 3.5, "end": 4.0,
                         "punctuated_word": "你！", "speaker": 1,
                         "speaker_confidence": 0.9},
                    ],
                }],
            }],
            # No "utterances" key — triggers fallback
        },
    }

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = mock_json
    mock_response.raise_for_status = MagicMock()

    with patch("app.services.transcription.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        segments = await transcribe_audio_deepgram(audio_file, api_key="test_key")

    assert len(segments) == 2
    assert segments[0]["text"] == "你好世界。"
    assert segments[1]["text"] == "谢谢你！"
    # Fallback segments must include word_timings from constituent words
    assert len(segments[0]["word_timings"]) == 2
    assert segments[0]["word_timings"][0]["text"] == "你好"
    assert segments[0]["word_timings"][1]["text"] == "世界。"
```

- [ ] **Step 5: Run tests — expect failures**

```bash
cd backend && python -m pytest tests/test_transcription.py -v
```

Expected: Multiple failures — `_segments_from_utterances` not defined, `word_timings` key missing from `_Segment`.

---

### Task 3: Implement `_segments_from_utterances` and update `_finalize_segment`

**Files:**
- Modify: `backend/app/services/transcription.py`

- [ ] **Step 1: Update `_finalize_segment` to include `word_timings`**

Replace the existing `_finalize_segment` function:

```python
def _finalize_segment(words: list[_Word], index: int) -> _Segment:
    """Create a segment dict from a list of word dicts."""
    text = "".join(w["text"] for w in words)
    return {
        "id": index,
        "start": words[0]["start"],
        "end": words[-1]["end"],
        "text": text,
        "word_timings": list(words),  # _Word has same shape as _WordTiming
    }
```

- [ ] **Step 2: Remove `_segments_from_paragraphs`, add `_segments_from_utterances`**

Delete the entire `_segments_from_paragraphs` function.

Add after `_group_words_into_segments`:

```python
def _segments_from_utterances(utterances: list[_DeepgramUtterance]) -> list[_Segment]:
    """Convert Deepgram utterance objects to segments.

    Each utterance becomes one segment. Deepgram inserts spaces between CJK tokens
    in transcript text (e.g. "你 在 学 什 么"). Stripping all spaces produces clean Chinese.
    Works for both single-speaker and multi-speaker content.
    """
    segments: list[_Segment] = []
    for i, utt in enumerate(utterances):
        text = utt["transcript"].replace(" ", "")
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
            "id": i,   # utterance-positional index (skipped empty utterances leave id gaps)
            "start": utt["start"],
            "end": utt["end"],
            "text": text,
            "word_timings": word_timings,
        })
    return segments
```

- [ ] **Step 3: Update `transcribe_audio_deepgram` to use utterances**

Replace the primary parsing block in `transcribe_audio_deepgram`. The function currently reads `paragraphs` from `channels[0].alternatives[0]`. Replace everything after `response.raise_for_status()` with:

```python
    data: _DeepgramResponse = response.json()
    results = data.get("results", {})  # type: ignore[union-attr]

    # Primary: use utterances (works for single-speaker and multi-speaker)
    utterances: list[_DeepgramUtterance] = results.get("utterances", [])  # type: ignore[assignment]
    if utterances:
        segments = _segments_from_utterances(utterances)
        logger.info("Deepgram transcription complete: %d segments from utterances", len(segments))
        return segments

    # Fallback: word-level grouping from channels
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
    return _group_words_into_segments(words)
```

Also fix the docstring: change `"nova-3"` to `"nova-2"` on the first line of the docstring.

Also update `_DEEPGRAM_PARAMS`: replace `"paragraphs": "true"` with `"utterances": "true"`.

- [ ] **Step 4: Run tests — expect pass**

```bash
cd backend && python -m pytest tests/test_transcription.py -v
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/transcription.py backend/tests/test_transcription.py
git commit -m "feat: switch Deepgram transcription to utterances with word_timings"
```

---

### Task 4: Update `lessons.py` assembly

**Files:**
- Modify: `backend/app/routers/lessons.py`
- Modify: `backend/tests/test_lessons_router.py`

- [ ] **Step 1: Check existing lessons router test for the segment shape**

Read `backend/tests/test_lessons_router.py` and find any assertions on segment fields. If it asserts on the assembled segment dict, it will need `wordTimings` added.

- [ ] **Step 2: Update assembly in `_shared_pipeline`**

In `lessons.py`, find the `lesson_segments.append({...})` block and add `wordTimings`:

```python
lesson_segments.append({
    "id": str(seg["id"]),
    "start": seg["start"],
    "end": seg["end"],
    "chinese": seg["text"],
    "pinyin": seg.get("pinyin", ""),
    "translations": seg.get("translations", {}),
    "words": vocab_map.get(seg["id"]) or vocab_map.get(str(seg["id"])) or [],
    "wordTimings": seg.get("word_timings") or None,
})
```

- [ ] **Step 3: Run all backend tests**

```bash
cd backend && python -m pytest -v
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
# Only add test_lessons_router.py if it was actually modified (it may not need changes)
git add backend/app/routers/lessons.py
git commit -m "feat: pass wordTimings through assembly pipeline"
```

---

## Chunk 2: Frontend — `SegmentText` Component

### Task 5: Update `types.ts` and write failing helper tests

**Files:**
- Modify: `frontend/src/types.ts`
- Create: `frontend/tests/SegmentText.test.ts`

- [ ] **Step 1: Add `WordTiming` and `wordTimings` to `types.ts`**

Read `frontend/src/types.ts` first. Make two additive changes:

1. **Add the new `WordTiming` interface** before the existing `Word` interface:

```typescript
export interface WordTiming {
  text: string  // Deepgram punctuated_word — one word, typically 1 CJK char
  start: number
  end: number
}
```

2. **Add `wordTimings?` to the existing `Segment` interface** — do not replace `Segment`, only add this one field:

```typescript
wordTimings?: WordTiming[]  // absent on lessons processed before this feature
```

- [ ] **Step 2: Write failing tests for helper functions**

Create `frontend/tests/SegmentText.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'

// These functions will be exported from SegmentText.tsx
// Import will fail until the file is created — that's the TDD red phase
import { buildPositionMap, buildWordSpans } from '@/components/lesson/SegmentText'
import type { Word, WordTiming } from '@/types'

const makeWord = (word: string): Word => ({
  word,
  pinyin: 'pīnyīn',
  meaning: 'test meaning',
  usage: 'test usage',
})

describe('buildWordSpans', () => {
  it('returns single plain span when no vocab words', () => {
    const spans = buildWordSpans('你好', [])
    expect(spans).toEqual([{ text: '你好', word: null }])
  })

  it('matches vocab word greedily', () => {
    const spans = buildWordSpans('桌子', [makeWord('桌子'), makeWord('桌')])
    expect(spans).toHaveLength(1)
    expect(spans[0].text).toBe('桌子')
    expect(spans[0].word?.word).toBe('桌子')
  })

  it('splits into vocab and plain spans', () => {
    const spans = buildWordSpans('我桌子', [makeWord('桌子')])
    expect(spans).toHaveLength(2)
    expect(spans[0]).toEqual({ text: '我', word: null })
    expect(spans[1].text).toBe('桌子')
  })

  it('merges adjacent unmatched chars into one plain span', () => {
    const spans = buildWordSpans('abc', [])
    expect(spans).toHaveLength(1)
    expect(spans[0].text).toBe('abc')
  })
})

describe('buildPositionMap', () => {
  const timings: WordTiming[] = [
    { text: '我', start: 0.0, end: 0.5 },
    { text: '的', start: 0.6, end: 0.9 },
    { text: '桌子', start: 1.0, end: 1.5 },
  ]

  it('maps single-char entries to their text positions', () => {
    const map = buildPositionMap('我的桌子', timings)
    expect(map.get(0)).toEqual({ text: '我', start: 0.0, end: 0.5 })
    expect(map.get(1)).toEqual({ text: '的', start: 0.6, end: 0.9 })
  })

  it('maps multi-char entry to all its positions', () => {
    const map = buildPositionMap('我的桌子', timings)
    // '桌子' is at positions 2 and 3
    expect(map.get(2)).toEqual({ text: '桌子', start: 1.0, end: 1.5 })
    expect(map.get(3)).toEqual({ text: '桌子', start: 1.0, end: 1.5 })
  })

  it('returns empty map for empty timings', () => {
    const map = buildPositionMap('你好', [])
    expect(map.size).toBe(0)
  })

  it('skips timing entries not found in text', () => {
    const map = buildPositionMap('你好', [
      { text: '再见', start: 0.0, end: 0.5 }, // not in text
      { text: '你', start: 1.0, end: 1.3 },
    ])
    expect(map.get(0)).toEqual({ text: '你', start: 1.0, end: 1.3 })
    expect(map.size).toBe(1)
  })

  it('punctuation in punctuated_word suffix is claimed and not re-matched', () => {
    // "好。" timing entry claims both '好' (pos 1) and '。' (pos 2)
    const map = buildPositionMap('你好。', [
      { text: '你', start: 0.0, end: 0.4 },
      { text: '好。', start: 0.5, end: 1.0 },
    ])
    expect(map.get(1)).toEqual({ text: '好。', start: 0.5, end: 1.0 })
    expect(map.get(2)).toEqual({ text: '好。', start: 0.5, end: 1.0 })
  })
})
```

- [ ] **Step 3: Run tests — expect failures**

```bash
cd frontend && npx vitest run tests/SegmentText.test.ts
```

Expected: FAIL — `Cannot find module '@/components/lesson/SegmentText'`

---

### Task 6: Create `SegmentText.tsx`

**Files:**
- Create: `frontend/src/components/lesson/SegmentText.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { Word, WordTiming } from '@/types'
import { Check, Copy, Loader2, Volume2 } from 'lucide-react'
import { memo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface WordSpan {
  text: string
  word: Word | null
}

export function buildWordSpans(text: string, words: Word[]): WordSpan[] {
  if (words.length === 0) {
    return [{ text, word: null }]
  }
  const sorted = words.toSorted((a, b) => b.word.length - a.word.length)
  const spans: WordSpan[] = []
  let remaining = text
  while (remaining.length > 0) {
    let matched = false
    for (const w of sorted) {
      if (remaining.startsWith(w.word)) {
        spans.push({ text: w.word, word: w })
        remaining = remaining.slice(w.word.length)
        matched = true
        break
      }
    }
    if (!matched) {
      const last = spans.at(-1)
      if (last && !last.word) {
        last.text += remaining[0]
      }
      else {
        spans.push({ text: remaining[0], word: null })
      }
      remaining = remaining.slice(1)
    }
  }
  return spans
}

// Build a map from character index in `text` to its WordTiming entry.
// Sequential non-overlapping scan: once a position is claimed it cannot be re-claimed.
// Timing entries not found at or after the current scan offset are skipped silently.
// buildPositionMap is exported for testing only — not part of the component's public API
export function buildPositionMap(text: string, wordTimings: WordTiming[]): Map<number, WordTiming> {
  const map = new Map<number, WordTiming>()
  let pos = 0
  for (const wt of wordTimings) {
    const idx = text.indexOf(wt.text, pos)
    if (idx === -1)
      continue
    for (let i = idx; i < idx + wt.text.length; i++) {
      map.set(i, wt)
    }
    pos = idx + wt.text.length
  }
  return map
}

interface SegmentTextProps {
  text: string
  words: Word[]
  wordTimings?: WordTiming[]
  currentTime?: number
  playTTS: (text: string) => Promise<void>
  loadingText: string | null
}

export const SegmentText = memo(function SegmentText({
  text,
  words,
  wordTimings,
  currentTime,
  playTTS,
  loadingText,
}: SegmentTextProps) {
  const [copiedWord, setCopiedWord] = useState<string | null>(null)

  const spans = buildWordSpans(text, words)
  const posMap = wordTimings?.length ? buildPositionMap(text, wordTimings) : null

  // Precompute span start offsets so we can look up character positions
  const spanStarts: number[] = []
  let offset = 0
  for (const span of spans) {
    spanStarts.push(offset)
    offset += span.text.length
  }

  const handleCopy = (word: string) => {
    navigator.clipboard.writeText(word)
    setCopiedWord(word)
    toast.success(`Copied "${word}" to clipboard`)
    setTimeout(setCopiedWord, 2000, null)
  }

  return (
    <TooltipProvider>
      <span>
        {spans.map((span, spanIdx) => {
          const spanStart = spanStarts[spanIdx]

          // Render each character in the span individually for per-char brightness
          const charSpans = span.text.split('').map((char, j) => {
            const charIdx = spanStart + j
            const wt = posMap?.get(charIdx)
            // If no timing data: full brightness. If timing found: dim until spoken.
            const dim = wt !== undefined && currentTime !== undefined && wt.end > currentTime
            return (
              <span key={j} className={cn(dim && 'text-foreground/30')}>
                {char}
              </span>
            )
          })

          if (!span.word) {
            return <span key={spanIdx}>{charSpans}</span>
          }

          return (
            <Tooltip key={spanIdx}>
              <TooltipTrigger
                // NOTE: text-inherit (not text-white/70) and no hover:text-white — intentional.
                // Per-character <span> children carry dim/bright classes. The trigger must
                // inherit their color rather than override it; a fixed text-white/70 or
                // hover:text-white would overwrite the karaoke brightness state.
                className="cursor-help rounded-sm px-0.5 text-inherit decoration-white/30 decoration-dotted underline-offset-4 transition-colors hover:bg-white/10 hover:underline"
              >
                {charSpans}
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="center"
                className="relative max-w-none rounded-2xl border border-white/10 bg-[oklch(0.13_0_0)]/95 p-0 shadow-2xl backdrop-blur-xl"
              >
                <div className="flex min-w-max divide-x divide-white/10">
                  {/* Section 1: Word & Pinyin */}
                  <div className="flex flex-col justify-center px-5 py-4">
                    <p className="text-xs font-medium tracking-wide text-white/45">
                      {span.word.pinyin}
                    </p>
                    <p className="mt-1 text-3xl font-bold tracking-tight text-white">
                      {span.word.word}
                    </p>
                  </div>

                  {/* Section 2: Meaning */}
                  <div className="flex max-w-60 flex-col justify-center px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/30">Meaning</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-white/80">
                      {span.word.meaning}
                    </p>
                  </div>

                  {/* Section 3: Usage example */}
                  {span.word.usage && (
                    <div className="flex max-w-70 flex-col justify-center px-5 py-4 pr-12">
                      <p className="text-xs font-semibold uppercase tracking-wider text-white/30">Example</p>
                      <p className="mt-1.5 text-sm italic leading-relaxed text-white/65">
                        {span.word.usage}
                      </p>
                    </div>
                  )}
                </div>

                {/* Action buttons — top-right corner */}
                <div className="absolute top-1 right-1 flex gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-7 text-white/30 hover:bg-white/[0.06] hover:text-white"
                    aria-label={loadingText === span.word.word ? 'Loading pronunciation' : `Play pronunciation of ${span.word.word}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      playTTS(span.word!.word)
                    }}
                  >
                    {loadingText === span.word.word
                      ? <Loader2 className="size-4 animate-spin" />
                      : <Volume2 className="size-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-7 text-white/30 hover:bg-white/[0.06] hover:text-white"
                    aria-label={copiedWord === span.word.word ? 'Copied!' : `Copy ${span.word.word}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCopy(span.word!.word)
                    }}
                  >
                    {copiedWord === span.word.word
                      ? <Check className="size-4 text-emerald-400" />
                      : <Copy className="size-4" />}
                  </Button>
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </span>
    </TooltipProvider>
  )
})
```

- [ ] **Step 2: Run helper tests — expect pass**

```bash
cd frontend && npx vitest run tests/SegmentText.test.ts
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/lesson/SegmentText.tsx frontend/tests/SegmentText.test.ts frontend/src/types.ts
git commit -m "feat: add SegmentText component with karaoke progress fill and WordTiming type"
```

---

### Task 7: Wire `SegmentText` into `TranscriptPanel`, delete `WordTooltip`

**Files:**
- Modify: `frontend/src/components/lesson/TranscriptPanel.tsx`
- Delete: `frontend/src/components/lesson/WordTooltip.tsx`

- [ ] **Step 1: Update `TranscriptPanel.tsx`**

Replace the `WordTooltip` import with `SegmentText` and `usePlayer`:

```tsx
// REMOVE:
import { WordTooltip } from './WordTooltip'

// ADD:
import { usePlayer } from '@/contexts/PlayerContext'
import { SegmentText } from './SegmentText'
```

Add `segmentTime` helper (module-level, before the component function):

```typescript
function segmentTime(segment: Segment, currentTime: number): number | undefined {
  if (!segment.wordTimings?.length)
    return undefined
  if ((segment.end ?? 0) <= currentTime)
    return Infinity    // fully spoken → all bright
  if ((segment.start ?? 0) > currentTime)
    return -Infinity   // not yet reached → all dim
  return currentTime   // active → in progress
}
```

Inside the component, add after the existing hooks:

```typescript
const { currentTime } = usePlayer()
```

Replace the `<WordTooltip .../>` JSX with:

```tsx
<SegmentText
  text={segment.chinese}
  words={segment.words}
  wordTimings={segment.wordTimings}
  currentTime={segmentTime(segment, currentTime)}
  playTTS={playTTS}
  loadingText={loadingText}
/>
```

- [ ] **Step 2: Verify `WordTooltip` has no other importers**

```bash
grep -r "WordTooltip" frontend/src --include="*.tsx" --include="*.ts" -l
```

Expected: Only `TranscriptPanel.tsx` appears (and it was already updated in Step 1). If any other file still imports `WordTooltip`, update it before deleting the file.

- [ ] **Step 3: Delete `WordTooltip.tsx`**

```bash
rm frontend/src/components/lesson/WordTooltip.tsx
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Run all frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/lesson/TranscriptPanel.tsx
git rm frontend/src/components/lesson/WordTooltip.tsx
git commit -m "feat: wire SegmentText into TranscriptPanel, remove WordTooltip"
```
