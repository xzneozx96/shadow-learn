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

**Candidate bar focus:** All candidate elements are `pointer-events: auto` but `tabIndex={-1}` (non-focusable). This ensures the `Space` key always stays trapped inside the `<input>` and cannot accidentally trigger `ShadowingDictationPhase`'s global Space-to-replay listener (which already guards with `!inInput`, but only when focus is on an input element).

### Dictionary

A JSON file at `frontend/src/lib/pinyin-dict.json`, imported as a static Vite JSON module:

```ts
import dict from '@/lib/pinyin-dict.json'
```

This is a zero-network-request import — bundled into the JS at build time. It maps pinyin syllable sequences to ordered hanzi candidate arrays (derived from CC-CEDICT). **Trade-off:** This adds to the initial JS bundle. Size target: < 500 KB minified. If this proves too large, the file moves to `public/` and is fetched once on app start (with a loading state), but the static import is preferred for simplicity.

### Affected exercises

| Component | Change |
|---|---|
| `DictationExercise` | Replace `<Input>` with `<ChineseInput>`; remove pinyin/hanzi toggle |
| `ShadowingDictationPhase` | Replace `<Input>` with `<ChineseInput>`; remove hanzi/pinyin toggle; **drop `inputMode` from `onSubmit` signature** (see below) |
| `ClozeExercise` | Replace inline `<input>` elements with `<ChineseInput>` (see layout note below) |
| `ReconstructionExercise` | No change — tile-based, no typing required |

### `ShadowingDictationPhase` — `onSubmit` signature change

The current signature is `onSubmit(answer: string, inputMode: 'hanzi' | 'pinyin')`. Since `ChineseInput` always produces hanzi, `inputMode` is no longer meaningful. The new signature is `onSubmit(answer: string)`. The caller (shadowing session logic upstream) must be updated to remove the `inputMode` parameter and any branching on it.

### `ClozeExercise` — candidate bar layout

The inline `<input>` elements in `ClozeExercise` sit inside a flowing text paragraph with fixed width (`w-14`). The floating candidate bar cannot be positioned with simple `absolute` CSS because the `ExerciseCard` container uses `overflow-hidden`, which would clip it.

**Solution:** The candidate bar is rendered via a React portal attached to `document.body`, positioned with `getBoundingClientRect()` on the input element. This is equivalent to the approach used by `floating-ui` / Radix `Popper`. No new dependency is required — a small custom hook (`useFloating`) is sufficient, or `floating-ui` can be added if already in the project.

### Grading

Unchanged. The committed value in the input is compared against `entry.sourceSegmentChinese` exactly as before. The IME only changes how the value is entered, not how it is evaluated.

---

## Part 2: Character Writing Exercise

### Component: `CharacterWritingExercise`

A new exercise card using the `hanzi-writer` library for stroke-order practice on individual vocabulary words.

**Location:** `frontend/src/components/study/exercises/CharacterWritingExercise.tsx`

**Props:**
```ts
interface Props {
  entry: VocabEntry
  progress?: string
  onNext: (correct: boolean) => void
}
```

### Flow

1. Card shows the word's meaning and pinyin; the character is hidden
2. User draws strokes on a canvas using mouse or touch
3. `hanzi-writer` validates each stroke in real time (fuzzy match, not pixel-perfect):
   - Correct stroke → snaps into place with success animation
   - Wrong stroke → rejected with shake animation; user retries
   - After 3 failures on a stroke → library animates the correct stroke as a hint; stroke is placed and user moves on (counted as incorrect)
4. For multi-character words (e.g. 你好): one character at a time, with a `1 / 2` progress indicator below the canvas
5. On all characters complete: calls `onNext(correct)` where correct = no hint was used on any stroke across all characters

**Correct** = completed with no hint triggered (neither automatic after 3 fails nor manual Hint button).
**Incorrect** = at least one stroke required a hint.

### Hint button

A manual "Hint" button is available at any time. Pressing it:
1. Calls `writer.animateCharacter()` — this exits quiz mode and plays the full stroke order animation
2. Marks the current character as incorrect (hint used)
3. After the animation completes (via `hanzi-writer`'s `onComplete` callback), shows a "Continue →" button to advance to the next character (or end the exercise)

**Why "Continue" instead of auto-resuming quiz:** `hanzi-writer`'s animation mode and quiz mode are mutually exclusive. Calling `animateCharacter()` cancels any active quiz. Restarting quiz mode after animation would replay from stroke 1, which is confusing mid-exercise. The "Continue" pattern avoids this entirely.

### Component: `HanziWriterCanvas`

An internal React wrapper component.

**Location:** `frontend/src/components/study/exercises/HanziWriterCanvas.tsx`

**Props:**
```ts
interface Props {
  character: string
  onComplete: (usedHint: boolean) => void
  onHintRequest: () => void  // called when manual Hint button pressed
}
```

- Mounts a `<div>` ref and initialises a `HanziWriter` instance via `useEffect`
- Starts quiz mode immediately on mount
- Renders at 200×200 with a grid background (outer border + cross dividers, standard Chinese writing grid)
- **Cleanup on unmount:** calls `writer.cancelAnimation()` then sets `containerRef.current.innerHTML = ''` to remove all SVG child nodes. `hanzi-writer` has no `.destroy()` method; these two steps are the correct cleanup.

### Character support check

`hanzi-writer` covers ~9,000 characters but not all Unicode CJK codepoints. Before scheduling a `CharacterWritingExercise` for a vocab entry, each character in `entry.word` must be checked for support.

**Approach:** Bundle a plain JSON set of supported codepoints at `frontend/src/lib/hanzi-writer-chars.json` (a flat array of character strings). At module load time, construct a `Set<string>` from this array. The scheduler calls `isWritingSupported(word: string): boolean` — a synchronous set lookup for each character — before adding a `'writing'` question. Entries with any unsupported character are skipped (no `CharacterWritingExercise` generated for that entry).

### Library

`hanzi-writer` (npm). All stroke data is bundled with the library; no CDN or network dependency at runtime.

---

## Part 3: Study Session Integration

Adding `CharacterWritingExercise` to `StudySession` requires changes at five touch points:

### 1. `ExerciseMode` union — `ModePicker.tsx`

Add `'writing'` to the union:
```ts
export type ExerciseMode = 'cloze' | 'dictation' | 'pinyin' | 'pronunciation' | 'reconstruction' | 'writing' | 'mixed'
```

### 2. `MODES` array — `ModePicker.tsx`

Add a tile:
```ts
{ id: 'writing', icon: '✏️', name: 'Write', desc: 'Draw the characters' }
```

### 3. `distributeExercises` — `StudySession.tsx`

Add `'writing'` to the `available` array (gated on whether the current pool has any entries with supported characters):
```ts
const available = ['cloze', 'dictation', 'pinyin', 'reconstruction']
if (hasAzure) available.push('pronunciation')
if (poolHasWritingEntries) available.push('writing')
```

### 4. `Question` type — `StudySession.tsx`

No new data fields needed. `CharacterWritingExercise` only requires `entry: VocabEntry`, which is already present on every `Question`.

### 5. Render branch — `StudySession.tsx` JSX

```tsx
{q.type === 'writing' && (
  <CharacterWritingExercise
    key={current}
    entry={q.entry}
    progress={`${current + 1} / ${questions.length}`}
    onNext={handleNext}
  />
)}
```

---

## Architecture Summary

```
pinyin-dict.json (static import, bundled)
        ↓
  ChineseInput component
        ↓
  candidate picker (portal, non-focusable)
        ↓
  committed hanzi value → existing grade logic (unchanged)

hanzi-writer (npm, stroke data bundled)
        ↓
  HanziWriterCanvas (cancelAnimation + innerHTML clear on unmount)
        ↓
  CharacterWritingExercise
        ↓
  onNext(correct) → StudySession
```

---

## New Files

| File | Purpose |
|---|---|
| `frontend/src/components/ui/ChineseInput.tsx` | Pinyin IME input component |
| `frontend/src/components/study/exercises/HanziWriterCanvas.tsx` | hanzi-writer React wrapper |
| `frontend/src/components/study/exercises/CharacterWritingExercise.tsx` | Stroke-order exercise card |
| `frontend/src/lib/pinyin-dict.json` | Bundled pinyin→hanzi dictionary (static import) |
| `frontend/src/lib/hanzi-writer-chars.json` | Set of supported codepoints for writing support check |

## Modified Files

| File | Change |
|---|---|
| `frontend/src/components/study/exercises/DictationExercise.tsx` | Use `ChineseInput`, remove pinyin toggle |
| `frontend/src/components/shadowing/ShadowingDictationPhase.tsx` | Use `ChineseInput`, remove hanzi/pinyin toggle, drop `inputMode` from `onSubmit` |
| `frontend/src/components/study/exercises/ClozeExercise.tsx` | Use `ChineseInput` with portal-based candidate bar |
| `frontend/src/components/study/ModePicker.tsx` | Add `'writing'` to `ExerciseMode`, add tile to `MODES` |
| `frontend/src/components/study/StudySession.tsx` | Add `'writing'` to `distributeExercises`, add render branch, gate on `poolHasWritingEntries` |
