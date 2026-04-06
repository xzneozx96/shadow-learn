# Code Review: feat/kana-writing-exercise

**Commit:** `e63df53`
**Date:** 2026-04-06
**Reviewer:** code-reviewer agent
**Scope:** AnimCJK kana stroke data integration for HanziWriter writing exercises

---

## Summary

The commit extends the HanziWriter-based character writing exercise to support hiragana and katakana in addition to CJK kanji. The approach is well-scoped: a bundled JSON data file replaces the CDN fetch that HanziWriter uses for kanji, and a thin charDataLoader adapter wires it into the existing component. The overall architecture is sound and integrates cleanly with the existing `CharacterWritingExercise` flow.

All 14 tests pass. No security issues were found.

---

## Issues

### HIGH

#### 1. `kanaCharDataLoader` return type does not satisfy `CharDataLoaderFn`

**File:** `frontend/src/lib/kana-char-data-loader.ts`

The HanziWriter type for `charDataLoader` is:

```ts
type CharDataLoaderFn = (
  char: string,
  onLoad: (data: CharacterJson) => void,
  onError: (err?: any) => void,
) => Promise<CharacterJson> | CharacterJson | void
```

where `CharacterJson` is:

```ts
type CharacterJson = {
  strokes: string[]
  medians: number[][][]
  radStrokes?: number[]
}
```

The `kanaCharDataLoader` defines its own local `KanaStrokeEntry` interface (which has an extra `character` field) and passes it to `onLoad`. TypeScript accepts this because the call is structurally compatible at the point of use — `kanaCharDataLoader` is spread into the options object with `charDataLoader: kanaCharDataLoader` without an explicit type annotation, so no type error surfaces. However, the `character` field is irrelevant noise to HanziWriter and the function is not assignable to `CharDataLoaderFn` explicitly. The loader should call `onLoad` with a `CharacterJson`-shaped value (omitting the `character` field), and its signature should import and use `CharDataLoaderFn` directly to surface any future API drift at compile time.

**Recommended fix:**

```ts
import type { CharDataLoaderFn, CharacterJson } from 'hanzi-writer'
import kanaData from './kana-stroke-data.json'

interface KanaStrokeEntry {
  character: string
  strokes: string[]
  medians: number[][][]
}

const kanaMap = kanaData as Record<string, KanaStrokeEntry>

export const kanaCharDataLoader: CharDataLoaderFn = (char, onLoad, onError) => {
  const entry = kanaMap[char]
  if (entry) {
    const charJson: CharacterJson = { strokes: entry.strokes, medians: entry.medians }
    onLoad(charJson)
  }
  else {
    onError(`No kana stroke data found for character: ${char}`)
  }
}
```

This makes the mismatch a compile-time error rather than a silent structural coincidence.

---

#### 2. `isWritingSupported` claims support for 15 codepoints that have no stroke data

**File:** `frontend/src/lib/hanzi-writer-chars.ts`

`isWritingSupported` accepts any codepoint in `U+3040–U+309F` (hiragana block) and `U+30A0–U+30FF` (katakana block). The bundled JSON covers all basic writable kana, but 15 codepoints in those ranges have no entry:

- Hiragana (10): `U+3040` (unused), `U+3097–U+309F` (combining voiced marks, iteration marks, digraph `ゟ`)
- Katakana (5): `U+30A0` (double hyphen `゠`), `U+30FB` (middle dot `・`), `U+30FD–U+30FF` (iteration marks, digraph `ヿ`)

If one of these characters reaches `HanziWriterCanvas`, `isWritingSupported` returns `true`, `isKanaChar` is `true`, `kanaCharDataLoader` is selected, and `onError` is called with a string message. HanziWriter handles `charDataLoader` errors by logging to console and leaving the canvas blank — the quiz never starts, but `onComplete` is never called either, so the exercise component stalls silently.

In practice, these are all non-writable punctuation or combining marks and are unlikely to appear in vocabulary lists. However, the range mismatch is a logical inaccuracy and creates a latent silent failure path.

**Recommended fix:** Either tighten the hiragana range to `U+3041–U+3096` and katakana to `U+30A1–U+30F6` (the actual drawable ranges), or add an explicit lookup into the JSON as the final gate:

```ts
import { kanaMap } from './kana-char-data-loader'

export function isWritingSupported(word: string): boolean {
  if (!word) return false
  return [...word].every((char) => {
    const cp = char.codePointAt(0)
    if (cp === undefined) return false
    if (cp >= CJK_START && cp <= CJK_END) return true
    if ((cp >= HIRAGANA_START && cp <= HIRAGANA_END)
      || (cp >= KATAKANA_START && cp <= KATAKANA_END)) {
      return char in kanaMap
    }
    return false
  })
}
```

---

### MEDIUM

#### 3. `as any` cast on `strokeData` in `onMistake` callback

**File:** `frontend/src/components/study/exercises/HanziWriterCanvas.tsx`, line 50

```ts
onMistake: (strokeData) => {
  if ((strokeData as any).mistakesOnStroke >= 3) {
```

`StrokeData` from `hanzi-writer` includes `mistakesOnStroke: number` directly — this field is part of the public type. The `as any` cast is unnecessary and suppresses the type checker on a public API property. Remove it:

```ts
onMistake: (strokeData) => {
  if (strokeData.mistakesOnStroke >= 3) {
    hintUsedRef.current = true
  }
},
```

---

#### 4. `isKanaChar` derived from `[...character].every()` is redundant given `CharacterWritingExercise` always passes single chars

**File:** `frontend/src/components/study/exercises/HanziWriterCanvas.tsx`, line 23

`CharacterWritingExercise` always calls `HanziWriterCanvas` with `currentChar`, which is one element of the spread `[...entry.word]` array. The `every()` on a single-char string always equals the single `isKana()` call. The `Props` interface has no constraint enforcing single-char input, so the implementation diverges from the actual invariant.

This is low-risk in practice but misleads future readers. Two options:

- **Narrower:** Replace `[...character].every(ch => isKana(ch))` with `isKana(character)` since `character` is always single-char by convention.
- **Stricter:** Add a dev-mode assertion in `useEffect` guarding `character.length === 1` or document the single-char contract in the `Props` interface with a JSDoc comment.

---

#### 5. No test for `kanaCharDataLoader`

**Files:** `frontend/src/lib/kana-char-data-loader.ts` (new file, zero test coverage)

The loader has two meaningful branches: found and not found. Neither is exercised by the existing tests. `hanzi-writer-chars.test.ts` only covers `isWritingSupported` and `isKana`. The loader is the integration point between the JSON bundle and HanziWriter; a missing-character bug here produces a silent stall.

**Recommended additions:**

```ts
// frontend/tests/kana-char-data-loader.test.ts
import { describe, expect, it, vi } from 'vitest'
import { kanaCharDataLoader } from '@/lib/kana-char-data-loader'

describe('kanaCharDataLoader', () => {
  it('calls onLoad with stroke data for a known hiragana character', () => {
    const onLoad = vi.fn()
    const onError = vi.fn()
    kanaCharDataLoader('あ', onLoad, onError)
    expect(onLoad).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()
    const data = onLoad.mock.calls[0][0]
    expect(Array.isArray(data.strokes)).toBe(true)
    expect(Array.isArray(data.medians)).toBe(true)
  })

  it('calls onError for a character not in the bundle', () => {
    const onLoad = vi.fn()
    const onError = vi.fn()
    kanaCharDataLoader('A', onLoad, onError)
    expect(onError).toHaveBeenCalledOnce()
    expect(onLoad).not.toHaveBeenCalled()
  })
})
```

---

### LOW

#### 6. `leniency: 1` for kanji vs `leniency: 1.2` for kana is a magic number with no comment

**File:** `frontend/src/components/study/exercises/HanziWriterCanvas.tsx`, line 46

The commit message explains the rationale ("shorter strokes need looser tolerance"), but that context lives only in git history. A brief inline comment would make the intent immediately legible to the next developer:

```ts
// Kana strokes are shorter and simpler; looser tolerance reduces false negatives
leniency: isKanaChar ? 1.2 : 1,
```

---

#### 7. `generate-kana-strokes.ts` uses `__dirname` which is not available in ESM modules

**File:** `scripts/generate-kana-strokes.ts`, line 33

```ts
const outputPath = path.resolve(
  __dirname,
  '../frontend/src/lib/kana-stroke-data.json',
)
```

`__dirname` is unavailable in native ESM. The script works today because `tsx` runs it via CJS interop, but if the project ever moves scripts to native ESM this will fail with `__dirname is not defined`. Since this is a one-time codegen script it is low urgency, but `import.meta.dirname` (Node 21.2+) or `fileURLToPath(new URL('../frontend/src/lib/kana-stroke-data.json', import.meta.url))` is the future-safe form.

---

#### 8. `kana-stroke-data.json` is 338 KB uncompressed and bundled as a static import

**File:** `frontend/src/lib/kana-stroke-data.json`

The JSON is imported statically (`import kanaData from './kana-stroke-data.json'`), which includes it in the main Vite bundle. 338 KB uncompressed compresses to roughly 60–80 KB gzipped, but it is loaded eagerly by every user even those who never study kana. Consider a dynamic import when the kana loader is first needed:

```ts
let kanaMap: Record<string, KanaStrokeEntry> | null = null

async function getKanaMap(): Promise<Record<string, KanaStrokeEntry>> {
  if (!kanaMap) {
    const mod = await import('./kana-stroke-data.json')
    kanaMap = mod.default as Record<string, KanaStrokeEntry>
  }
  return kanaMap
}
```

This is a nice-to-have given the app is already offline-first and IndexedDB-heavy; the bundle impact may be acceptable.

---

## What Was Done Well

- The Unicode range constants are named and documented clearly with hex values and comments.
- The `isKana` helper is a clean, single-responsibility export that avoids duplicating the range logic.
- The `kanaCharDataLoader` is correctly synchronous (the `CharDataLoaderFn` signature allows `void` return), avoiding unnecessary Promise overhead for a bundled in-memory lookup.
- The `charDataLoader` is injected only for kana using a conditional spread, keeping the kanji path completely unchanged.
- The `generate-kana-strokes.ts` script is defensive: it validates each parsed line's structure before accepting it, skips malformed lines silently, and exits with a non-zero code if no entries were parsed.
- JSON data integrity is clean: 177 entries, all keys match `character` fields, all strokes/medians arrays are aligned and non-empty, all codepoints are within the declared ranges.
- All 14 tests pass; the 9 new kana cases cover both hiragana and katakana for `isWritingSupported` and `isKana`.

---

## Verdict

**Approve with two fixes before next merge:**

1. (HIGH) Align `kanaCharDataLoader` return type with `CharDataLoaderFn` and strip the extra `character` field from the `onLoad` payload.
2. (HIGH) Tighten `isWritingSupported` to exclude non-writable kana codepoints that have no stroke data.

Items 3–5 (MEDIUM) are low-risk in the current call graph but worth addressing in a follow-up: the `as any` cast is unnecessary, the `every()` on single chars is misleading, and `kanaCharDataLoader` lacks a dedicated test.
