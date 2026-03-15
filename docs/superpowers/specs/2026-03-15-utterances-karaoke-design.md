# Utterances Pipeline + Karaoke Progress Fill

**Date:** 2026-03-15
**Status:** Approved

## Overview

Two related changes shipped together because the data flows from one to the other:

1. **Backend:** Switch Deepgram transcription from `paragraphs` to `utterances`. Each utterance becomes a segment and carries per-Deepgram-word timestamps (`word_timings`). Note: a Deepgram "word" for Chinese is typically a single CJK character but can be multi-character (e.g. `"发现"`) or include trailing punctuation (e.g. `"发现。"`). The term "word timing" is used throughout to reflect this.
2. **Frontend:** Use those timestamps to render a karaoke-style progress fill on the Chinese text line. Spoken words (where `wordTiming.end <= currentTime`) are full brightness; unspoken are dimmed. Vocab tooltips continue to work unchanged on the same characters.

---

## Part 1 — Backend: Utterances Pipeline

### Deepgram params

Replace `"paragraphs": "true"` with `"utterances": "true"` in `_DEEPGRAM_PARAMS`. Keep all other params: `diarize: true`, `punctuate: true`, `smart_format: true`, `language: zh-CN`, `model: nova-2`.

- `diarize: true` is kept — utterances still respect speaker changes for multi-speaker content.
- `smart_format: true` is kept — it applies formatting via `punctuated_word`. The `replace(" ", "")` normalisation applied to utterance transcript text remains correct because Deepgram still inserts spaces between CJK tokens in utterance transcripts when `smart_format` is active.
- `model: nova-2` is the correct model. The docstring on `transcribe_audio_deepgram` currently says "nova-3" erroneously — fix it to `nova-2` to match `_DEEPGRAM_PARAMS`.

### TypedDict changes

```python
class _WordTiming(TypedDict):
    text: str    # punctuated_word, or word key as fallback
    start: float
    end: float

class _Segment(TypedDict):
    id: int
    start: float
    end: float
    text: str
    word_timings: list[_WordTiming]  # one entry per Deepgram word (typically one CJK char)
```

`_CharTiming` is not used. The field is named `word_timings` throughout to accurately reflect that entries are Deepgram word objects, not guaranteed single characters.

Add `_DeepgramUtterance` TypedDict:

```python
class _DeepgramUtterance(TypedDict):
    start: float
    end: float
    transcript: str
    words: list[_DeepgramWord]
    speaker: int
    id: str
    channel: int
    confidence: float
```

Update `_DeepgramResults` to include the `utterances` field:

```python
class _DeepgramResults(TypedDict):
    channels: list[_DeepgramChannel]
    utterances: list[_DeepgramUtterance]
```

Remove `_DeepgramParagraph`, `_DeepgramParagraphsObject`, `_DeepgramSentence` TypedDicts.

### Parsing — primary path

```python
def _segments_from_utterances(utterances: list[_DeepgramUtterance]) -> list[_Segment]:
    segments = []
    for i, utt in enumerate(utterances):
        text = utt["transcript"].replace(" ", "")   # strip CJK inter-character spaces
        if not text:
            continue
        word_timings = [
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

`results.utterances` is a **top-level key on `results`**, not nested inside `channels`. Read it as:
```python
utterances = data.get("results", {}).get("utterances", [])
```

### Parsing — fallback path

If `utterances` is empty (defensive — should not occur with `utterances=true`), fall back to word-level grouping from `channels[0].alternatives[0].words`.

Update `_finalize_segment` to carry the word list through:

```python
def _finalize_segment(words: list[_Word], index: int) -> _Segment:
    text = "".join(w["text"] for w in words)
    return {
        "id": index,
        "start": words[0]["start"],
        "end": words[-1]["end"],
        "text": text,
        "word_timings": list(words),   # _Word has same shape as _WordTiming
    }
```

`_group_words_into_segments` already calls `_finalize_segment` with the current word buffer — no other changes needed there.

### Assembly (`lessons.py`)

In `_shared_pipeline`, add `wordTimings` to the assembled segment dict. Use `or None` (not a default of `[]`) so the field is absent on segments that have no timing data, preserving the frontend's backwards-compat check:

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

### Removed code

- `_segments_from_paragraphs` function
- `_DeepgramParagraph`, `_DeepgramParagraphsObject`, `_DeepgramSentence` TypedDicts
- All `paragraphs`-related parsing in `transcribe_audio_deepgram`

### Tests

- Replace `test_segments_from_paragraphs_*` with `test_segments_from_utterances_*` tests that verify: space stripping, `word_timings` population, correct `id`/`start`/`end`.
- Update integration test mock: replace `channels[0].alternatives[0].paragraphs` payload with a `results.utterances` list.
- Update `test_group_words_splits_*` expected segment shape to include `word_timings` field.
- Add test for fallback path: when `utterances` is absent, falls back to word-level grouping and segments include `word_timings` from their constituent words.

---

## Part 2 — Frontend: `SegmentText` Component + Types

### `types.ts`

```typescript
export interface WordTiming {
  text: string   // Deepgram punctuated_word — one word, typically 1 CJK char
  start: number
  end: number
}

export interface Segment {
  // ...existing fields unchanged...
  wordTimings?: WordTiming[]  // absent on lessons processed before this feature
}
```

`wordTimings` is optional. Existing lessons stored in IndexedDB without this field render at full brightness with vocab tooltips intact — identical to current behaviour.

### `SegmentText` component

New file: `frontend/src/components/lesson/SegmentText.tsx`.

Replaces `WordTooltip` in `TranscriptPanel`. `WordTooltip.tsx` is deleted (its logic is absorbed into `SegmentText`).

**Props:**
```typescript
interface SegmentTextProps {
  text: string
  words: Word[]
  wordTimings?: WordTiming[]
  currentTime?: number
  playTTS: (text: string) => Promise<void>
  loadingText: string | null
}
```

**Rendering logic:**

1. Split `text` into spans using the same greedy vocab-word matching as `buildWordSpans` in the current `WordTooltip`. The algorithm is: sort vocab `words` by length descending; greedily match each against the remaining text; unmatched characters fall into plain-text spans.

2. Build a position map: walk `wordTimings` in order, finding each entry's `text` in `segment.text` starting from the last matched position (sequential, non-overlapping scan). Record `{charStart, charEnd, end}` for each matched entry. This handles multi-character entries (e.g. `"发现"` spans positions 3–4) and punctuation-suffixed entries (e.g. `"发现。"` spans positions 3–5). Rules: once a character position is claimed by a `wordTiming` entry it cannot be claimed again; `wordTiming` entries whose text is not found at or after the current scan offset are skipped silently. This means punctuation embedded in a `punctuated_word` suffix (e.g. `"。"` in `"发现。"`) is claimed by that entry and will not be re-matched by any later entry.

3. For each rendered character at position `i` in `text`:
   - If a `wordTiming` covers position `i` and `wordTiming.end <= currentTime` → **spoken** (full brightness)
   - If a `wordTiming` covers position `i` and `wordTiming.end > currentTime` → **unspoken** (dimmed, `text-foreground/30`)
   - If no `wordTiming` covers position `i` (unmatched char, e.g. punctuation not in any timing entry) → **full brightness** (treat as already spoken / neutral)

4. Vocab word spans (matched to a `Word` entry) wrap their character spans in the existing tooltip trigger. The tooltip popup content (pinyin, meaning, usage, TTS button, copy button) is identical to `WordTooltip` today.

5. When `wordTimings` is absent or empty: all characters render at full brightness. Vocab tooltips still work.

**Multi-character timing entries treated as atomic:** When a `wordTiming` covers multiple characters (e.g. `"发现"`), all characters in that entry share the same `end` timestamp. They all transition from dim to bright together when `wordTiming.end <= currentTime`.

**Component should be wrapped in `React.memo`** (default shallow comparator).

### `TranscriptPanel` changes

Add `usePlayer` import and call:
```typescript
const { currentTime } = usePlayer()
```

`usePlayer()` is valid here because `PlayerProvider` wraps the entire lesson view tree above `TranscriptPanel`. This is consistent with how `VideoPanel` already calls `usePlayer()` at its own level. `currentTime` is **not** drilled as a prop from `LessonView` — `TranscriptPanel` reads it directly from context.

**Performance: pass a derived time value, not raw `currentTime`, to each `SegmentText`.**

`currentTime` changes ~4× per second. Passing it to every `SegmentText` in the list would cause all of them to re-render on every tick, defeating `React.memo`. Instead, `TranscriptPanel` computes a stable proxy value per segment:

```typescript
function segmentTime(segment: Segment, currentTime: number): number | undefined {
  if (!segment.wordTimings?.length) return undefined
  if ((segment.end ?? 0) <= currentTime) return Infinity   // fully spoken → all bright
  if ((segment.start ?? 0) > currentTime) return -Infinity // not started → all dim
  return currentTime                                        // active → in progress
}
```

- **Past segments** (`segment.end <= currentTime`): receive `Infinity`. All chars are bright. Prop value stays `Infinity` until the lesson resets — `React.memo` suppresses re-renders.
- **Future segments** (`segment.start > currentTime`): receive `-Infinity`. All chars are dim. Prop value stays `-Infinity` — suppressed.
- **Active segment** (time window overlaps): receives real `currentTime`. Re-renders on every tick — correct and expected.

Replace `WordTooltip` usage:
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

---

## Data Flow

```
Deepgram API
  └─ results.utterances[i].words[j]
       → {word, punctuated_word, start, end, speaker, ...}
            ↓
_segments_from_utterances()
  └─ _Segment { id, start, end, text, word_timings: [{text, start, end}] }
            ↓
_shared_pipeline() assembly (lessons.py)
  └─ JSON { ..., wordTimings: [{text, start, end}] | null }
            ↓
IndexedDB (segments store, keyed by lessonId)
            ↓
SegmentText component
  └─ wordTiming.end <= currentTime → bright span  (spoken)
  └─ wordTiming.end >  currentTime → dim span     (unspoken)
  └─ vocab word boundary           → tooltip trigger wrapper
```

---

## Backwards Compatibility

- Existing lessons in IndexedDB have no `wordTimings` field. `SegmentText` treats absent/empty `wordTimings` as full brightness — identical to current behaviour.
- The `paragraphs` parsing path is removed. New lessons processed after this change use utterances exclusively.
- `wordTimings: null` (sent from assembly when `word_timings` is absent) and `wordTimings: undefined` (absent from old IndexedDB records) are both handled the same way by the frontend optional check.
