# Chinese Input — Design Spec

**Date:** 2026-03-16
**Status:** Approved

## Problem

All exercises that require typing Chinese currently rely on the user having an OS-level Input Method Editor (IME) configured. Most learners — especially beginners — do not have one set up. The existing "pinyin mode" toggle is a fallback but undermines the goal of character memorization.

## Goals

- Allow any user to type Chinese characters in exercises without OS IME configuration
- Add a dedicated exercise type for stroke-order character writing to build muscle memory
- No backend changes required — everything is client-side

## Out of Scope

- Handwriting recognition for sentences (only single characters via hanzi-writer)
- Cloud sync of stroke performance data
- Simplified/Traditional conversion

---

## Part 1: In-app Pinyin IME

### Component: `ChineseInput`

A drop-in replacement for `<Input>` in all typing exercises. Visually identical to the existing input, with a floating candidate picker that appears while the user buffers pinyin syllables.

**Location:** `frontend/src/components/ui/ChineseInput.tsx`

### Interaction

1. User types latin letters (`n`, `i`, `h`, `a`, `o`)
2. Component buffers the syllables and queries a bundled pinyin→hanzi dictionary
3. A floating candidate bar appears above the input showing up to 9 candidates
4. User selects a candidate:
   - `Space` or `Enter` → first candidate
   - `1`–`9` → candidate by position
   - Mouse/touch click → candidate by click
5. Selected hanzi is appended to the committed input value; buffer clears
6. `Escape` dismisses candidates and clears the buffer

### Dictionary

A bundled JSON file (derived from CC-CEDICT or similar) mapping pinyin syllable sequences to ordered hanzi candidates. Loaded once at app start, no network request. Size target: < 500 KB.

### Affected exercises

| Component | Change |
|---|---|
| `DictationExercise` | Replace `<Input>` with `<ChineseInput>`; remove pinyin/hanzi toggle |
| `ShadowingDictationPhase` | Replace `<Input>` with `<ChineseInput>`; remove hanzi/pinyin toggle |
| `ClozeExercise` | Replace inline `<input>` elements with `<ChineseInput>` |
| `ReconstructionExercise` | No change — tile-based, no typing required |

### Grading

Unchanged. The committed value in the input is compared against `entry.sourceSegmentChinese` exactly as before. The IME only changes how the value is entered, not how it is evaluated.

---

## Part 2: Character Writing Exercise

### Component: `CharacterWritingExercise`

A new exercise card using the `hanzi-writer` library for stroke-order practice on individual vocabulary words.

**Location:** `frontend/src/components/study/exercises/CharacterWritingExercise.tsx`

### Flow

1. Card shows the word's meaning and pinyin; the character is hidden
2. User draws strokes on a canvas using mouse or touch
3. `hanzi-writer` validates each stroke in real time (fuzzy match, not pixel-perfect):
   - Correct stroke → snaps into place with success animation
   - Wrong stroke → rejected with shake animation; user retries
   - After 3 failures on a stroke → library animates the correct stroke as a hint; stroke is placed and user moves on
4. For multi-character words (e.g. 你好): one character at a time, with a `1 / 2` progress indicator
5. On completion: shows ✓ with full word, pinyin, meaning; calls `onNext(correct)`

**Correct** = completed with no hint used on any stroke.
**Incorrect** = at least one stroke required a hint.

### Hint button

A manual "Hint" button is also available at any time. First press animates the full stroke order for the current character. Pressing it counts as incorrect.

### Component: `HanziWriterCanvas`

An internal React wrapper component.

**Location:** `frontend/src/components/study/exercises/HanziWriterCanvas.tsx`

- Mounts a `<div>` ref and initialises a `HanziWriter` instance via `useEffect`
- Starts quiz mode immediately on mount
- Accepts `character`, `onComplete(usedHint: boolean)` props
- Cleans up the writer instance on unmount
- Renders at a fixed size (e.g. 200×200) with a grid background (standard Chinese writing grid: outer border + cross dividers)

### Library

`hanzi-writer` (npm). Covers ~9,000 characters — sufficient for all common vocabulary. All stroke data is bundled with the library; no CDN or network dependency.

### Study session integration

`CharacterWritingExercise` is added to the exercise rotation in `StudySession` alongside `PinyinRecallExercise`. Both are word-level exercises. The scheduler selects it for vocab entries where the word's characters are all supported by hanzi-writer.

---

## Architecture Summary

```
pinyin dict (JSON, bundled)
        ↓
  ChineseInput component
        ↓
  candidate picker UI
        ↓
  value → existing grade logic (unchanged)

hanzi-writer (npm)
        ↓
  HanziWriterCanvas
        ↓
  CharacterWritingExercise
        ↓
  onNext(correct) → StudySession
```

## New Files

| File | Purpose |
|---|---|
| `frontend/src/components/ui/ChineseInput.tsx` | Pinyin IME input component |
| `frontend/src/components/study/exercises/HanziWriterCanvas.tsx` | hanzi-writer React wrapper |
| `frontend/src/components/study/exercises/CharacterWritingExercise.tsx` | Stroke-order exercise card |
| `frontend/src/lib/pinyin-dict.ts` | Dictionary loader + candidate lookup |
| `frontend/public/pinyin-dict.json` | Bundled pinyin→hanzi dictionary |

## Modified Files

| File | Change |
|---|---|
| `frontend/src/components/study/exercises/DictationExercise.tsx` | Use `ChineseInput`, remove pinyin toggle |
| `frontend/src/components/shadowing/ShadowingDictationPhase.tsx` | Use `ChineseInput`, remove hanzi/pinyin toggle |
| `frontend/src/components/study/exercises/ClozeExercise.tsx` | Use `ChineseInput` for inline inputs |
| `frontend/src/components/study/StudySession.tsx` | Add `CharacterWritingExercise` to rotation |
