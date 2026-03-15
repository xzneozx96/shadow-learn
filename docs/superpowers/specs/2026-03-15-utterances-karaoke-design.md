# Utterances Pipeline + Karaoke Progress Fill

**Date:** 2026-03-15
**Status:** Approved

## Overview

Two related changes shipped together because the data flows from one to the other:

1. **Backend:** Switch Deepgram transcription from `paragraphs` to `utterances`. Each utterance becomes a segment and carries per-character timestamps (`char_timings`).
2. **Frontend:** Use those timestamps to render a karaoke-style progress fill on the Chinese text line. Vocab tooltips continue to work unchanged on the same characters.

---

## Part 1 — Backend: Utterances Pipeline

### Deepgram params

Replace `"paragraphs": "true"` with `"utterances": "true"` in `_DEEPGRAM_PARAMS`. Keep `diarize: true` — utterances respect speaker changes for multi-speaker content too.

### Segment shape

Each utterance (`results.utterances[i]`) becomes one segment. The utterance's `words[]` are stored as `char_timings` — one entry per CJK character with its spoken time window.

```python
class _CharTiming(TypedDict):
    text: str    # punctuated_word or word fallback
    start: float
    end: float

class _Segment(TypedDict):
    id: int
    start: float
    end: float
    text: str
    char_timings: list[_CharTiming]
```

### Parsing

```
_segments_from_utterances(utterances):
  for each utterance:
    text = utterance["transcript"].replace(" ", "")   # strip CJK spaces
    char_timings = [{text: punctuated_word or word, start, end} for w in utterance["words"]]
    yield {id, start, end, text, char_timings}
```

`results.utterances` is a top-level key on `results`, not nested inside `channels`. The parser reads it directly.

### Fallback

If `results.utterances` is empty (defensive — shouldn't happen with `utterances=true`), fall back to word-level grouping from `channels[0].alternatives[0].words`. Fallback segments still populate `char_timings` from the words that compose each segment.

### Assembly (`lessons.py`)

Pass `char_timings` through as `charTimings` in the assembled segment JSON alongside existing fields (`chinese`, `pinyin`, `translations`, `words`).

### Removed code

- `_segments_from_paragraphs` function
- `_DeepgramParagraph`, `_DeepgramParagraphsObject`, `_DeepgramSentence` TypedDicts

### Tests

- Replace `test_segments_from_paragraphs_*` tests with `test_segments_from_utterances_*`
- Update integration test mock: use `results.utterances` instead of `channels[0].alternatives[0].paragraphs`
- Existing `test_group_words_*` and `test_normalize_deepgram_words_*` tests remain valid; update expected segment shape to include `char_timings`

---

## Part 2 — Frontend: `SegmentText` Component + Types

### `types.ts`

```typescript
export interface CharTiming {
  text: string
  start: number
  end: number
}

export interface Segment {
  // ...existing fields unchanged...
  charTimings?: CharTiming[]  // absent on lessons processed before this feature
}
```

`charTimings` is optional so existing lessons stored in IndexedDB continue to render normally — those segments simply skip progress fill.

### `SegmentText` component

New component at `frontend/src/components/lesson/SegmentText.tsx`. Replaces `WordTooltip` in `TranscriptPanel`. `WordTooltip.tsx` is deleted.

**Props:**
```typescript
interface SegmentTextProps {
  text: string
  words: Word[]
  charTimings?: CharTiming[]
  currentTime?: number
  playTTS: (text: string) => Promise<void>
  loadingText: string | null
}
```

**Rendering logic:**

1. Split `text` into spans using the same greedy vocab-word matching as `buildWordSpans` in `WordTooltip`.
2. For each span, render characters individually. A character is "spoken" when its `charTiming.end <= currentTime`.
3. Spoken chars: full brightness. Unspoken chars: dimmed (`text-foreground/30` or equivalent).
4. Vocab word spans (matched to a `Word` entry) wrap their character spans in the existing tooltip trigger. The tooltip popup content (pinyin, meaning, usage, TTS button, copy button) is identical to today.
5. Plain text spans (punctuation, unmatched chars): same bright/dim treatment, no tooltip.

**Character timing lookup:** Build a map from character position in `text` to `CharTiming` entry by walking `charTimings` in order, matching each entry's `text` against `text` starting from the last matched position. This handles punctuation attached to characters (e.g. `"发。"` as one timing entry).

**When `charTimings` is absent or empty:** All characters render at full brightness (no dimming). Vocab tooltips still work.

### `TranscriptPanel` changes

```typescript
const { currentTime } = usePlayer()
```

Pass to `SegmentText`:
```tsx
<SegmentText
  text={segment.chinese}
  words={segment.words}
  charTimings={segment.charTimings}
  currentTime={currentTime}
  playTTS={playTTS}
  loadingText={loadingText}
/>
```

`currentTime` is passed for every segment in the list — `SegmentText` applies the dimming logic using its own `charTimings`. No conditional logic needed in `TranscriptPanel`.

### Performance

`currentTime` updates ~4× per second via the browser `timeupdate` event. The segment list re-renders on each tick; React reconciliation is cheap since only the active segment produces different character class output. No memoization is needed.

---

## Data Flow

```
Deepgram API
  └─ results.utterances[i].words[j] → {word, start, end, punctuated_word}
        ↓
_segments_from_utterances()
  └─ _Segment { id, start, end, text, char_timings: [{text, start, end}] }
        ↓
_shared_pipeline() assembly
  └─ JSON segment { ..., charTimings: [{text, start, end}] }
        ↓
IndexedDB (segments store)
        ↓
SegmentText component
  └─ charTiming.end <= currentTime → bright span
  └─ charTiming.end >  currentTime → dim span
  └─ vocab word boundary → tooltip trigger wrapper
```

---

## Backwards Compatibility

- Existing lessons in IndexedDB have no `charTimings` field. `SegmentText` renders them at full brightness with vocab tooltips intact — identical to current behaviour.
- The `paragraphs` path is removed. New lessons processed after this change use utterances.
