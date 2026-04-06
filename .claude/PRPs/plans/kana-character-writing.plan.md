# Plan: Kana Character Writing Exercise

## Summary
Extend the existing `CharacterWritingExercise` to support Japanese hiragana and katakana characters using AnimCJK stroke data, in addition to the existing kanji support via the HanziWriter CDN. This involves generating a bundled JSON file of kana stroke data from AnimCJK's `graphicsJaKana.txt`, implementing a `charDataLoader` for HanziWriter, extending `isWritingSupported` to recognise kana Unicode ranges, and wiring the loader into `HanziWriterCanvas`.

## User Story
As a Japanese language learner using ShadowLearn,
I want to practice writing hiragana and katakana characters in character writing exercises,
So that I can reinforce kana muscle memory the same way I already practice kanji stroke order.

## Problem → Solution
Currently `isWritingSupported` only accepts CJK Unified Ideographs (U+4E00–U+9FFF). Any hiragana or katakana word is silently excluded from writing exercises and the `writing` question type is never generated for kana vocabulary. HanziWriter itself cannot fetch kana from its CDN because only kanji data is hosted there.

→ Generate a self-contained `kana-stroke-data.json` from AnimCJK's open-source `graphicsJaKana.txt`. Register the kana characters' Unicode ranges in `isWritingSupported`, then provide the JSON data to HanziWriter via its existing `charDataLoader` option when the character is kana. Leniency is increased slightly (1.2 vs 1.0) for kana because strokes are shorter and simpler. No new npm dependencies required.

## Metadata
- **Complexity**: Medium
- **Source PRD**: N/A
- **PRD Phase**: N/A
- **Estimated Files**: 6 (3 modified, 2 created, 1 generated)

---

## UX Design

### Before
```
Study Session — Japanese lesson with kana words
┌────────────────────────────────────────────┐
│  Exercise types available for "あ":         │
│    ✓ Listening                              │
│    ✓ Speaking                               │
│    ✗ Writing  ← silently excluded           │
└────────────────────────────────────────────┘
```

### After
```
Study Session — Japanese lesson with kana words
┌────────────────────────────────────────────┐
│  Exercise types available for "あ":         │
│    ✓ Listening                              │
│    ✓ Speaking                               │
│    ✓ Writing  ← now included for kana       │
│                                             │
│  [ HanziWriter canvas with stroke guide ]  │
│  [ Stroke 1 of 3 — draw the stroke ]       │
└────────────────────────────────────────────┘
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| `isWritingSupported("あ")` | `false` | `true` | Hiragana U+3040–U+309F added |
| `isWritingSupported("ア")` | `false` | `true` | Katakana U+30A0–U+30FF added |
| `isWritingSupported("漢")` | `true` | `true` | Unchanged — CDN path still used |
| Writing exercise generated | Never for kana | Generated when kana word | `study-utils.ts` already gates on `isWritingSupported` |
| HanziWriter canvas for kana | N/A | Loads from bundled JSON | `charDataLoader` callback resolves from `kana-stroke-data.json` |
| Leniency setting | 1.0 for all | 1.2 for kana, 1.0 for kanji | Shorter strokes need looser tolerance |
| Radical hint section | N/A for kana | Empty array `[]` | try/catch already returns `[]` — no change needed |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 (critical) | `frontend/src/lib/hanzi-writer-chars.ts` | all | Current `isWritingSupported` — must extend for kana ranges |
| P0 (critical) | `frontend/src/components/study/exercises/HanziWriterCanvas.tsx` | all | HanziWriter instantiation — must add `charDataLoader` for kana |
| P0 (critical) | `frontend/src/components/study/exercises/CharacterWritingExercise.tsx` | 44-54 | Radical decomposition — confirms kana already returns `[]` safely |
| P1 (important) | `frontend/src/lib/study-utils.ts` | 90-96 | `writing` question generation gate — no change needed, reads `isWritingSupported` |
| P1 (important) | `frontend/src/components/study/StudySession.tsx` | 169, 399-406 | `hasWriting` gate + render guard — no change needed |
| P1 (important) | `frontend/tests/hanzi-writer-chars.test.ts` | all | Existing tests — must keep passing; extend with kana cases |
| P2 (reference) | `frontend/package.json` | — | Confirms `hanzi-writer: ^3.7.3` — `charDataLoader` option is available in v3.x |

---

## External Documentation

| Topic | Source | Key Takeaway |
|---|---|---|
| AnimCJK `graphicsJaKana.txt` | https://github.com/skishore/makemeahanzi | One JSON object per line; fields: `character`, `strokes` (SVG paths), `medians` (arrays of `[x,y]`), `radStrokes`. This is the exact format HanziWriter expects from a `charDataLoader`. |
| HanziWriter `charDataLoader` option | https://hanziwriter.org/docs.html | `charDataLoader: (char, onLoad, onError) => void`. Call `onLoad(data)` with an object matching `{ character, strokes, medians }`. Called once per character; result is cached internally by HanziWriter. |
| HanziWriter v3 `quiz()` options | https://hanziwriter.org/docs.html | `leniency` (default 1) multiplies the allowed error radius. Values > 1 make strokes easier to recognise. |
| Unicode Hiragana block | Unicode Standard | U+3040–U+309F (96 code points). Includes small kana (ぁぃぅぇぉ), combining marks, and the iteration mark ゞ. |
| Unicode Katakana block | Unicode Standard | U+30A0–U+30FF (96 code points). Includes small katakana, voiced marks, and the middle dot ・. |

---

## Patterns to Mirror

### CHAR_RANGE_CHECK
```typescript
// SOURCE: frontend/src/lib/hanzi-writer-chars.ts (current)
// CJK Unified Ideographs block: U+4E00–U+9FFF
const CJK_START = 0x4E00
const CJK_END = 0x9FFF

export function isWritingSupported(word: string): boolean {
  if (!word) return false
  return [...word].every((char) => {
    const cp = char.codePointAt(0)
    return cp !== undefined && cp >= CJK_START && cp <= CJK_END
  })
}
// EXTEND: add HIRAGANA_START/END and KATAKANA_START/END; return true when cp falls
// in any of the three ranges.
```

### CHAR_DATA_LOADER_SHAPE
```typescript
// HanziWriter v3 charDataLoader signature expected by the library
type CharDataLoader = (
  char: string,
  onLoad: (data: { character: string; strokes: string[]; medians: number[][][] }) => void,
  onError: (reason?: string) => void,
) => void
```

### ANIMCJK_LINE_FORMAT
```jsonc
// One line from graphicsJaKana.txt — exactly what charDataLoader must pass to onLoad
{"character":"あ","strokes":["M 200 700 Q ..."],"medians":[[[102,706],...]],"radStrokes":[]}
```

### HANZIWRITER_CANVAS_PATTERN
```typescript
// SOURCE: frontend/src/components/study/exercises/HanziWriterCanvas.tsx (current)
const writer = HanziWriter.create(container, character, {
  width: 200,
  height: 200,
  padding: 10,
  showOutline,
  strokeColor: '#ffffff',
  outlineColor: '#3f3f46',
  drawingColor: '#60a5fa',
  drawingWidth: 4,
})
writer.quiz({
  onComplete: () => { onComplete(hintUsedRef.current) },
  leniency: 1,
  showHintAfterMisses: 3,
  onMistake: (strokeData) => {
    if ((strokeData as any).mistakesOnStroke >= 3) {
      hintUsedRef.current = true
    }
  },
})
// EXTEND: detect kana before HanziWriter.create(); if kana, add charDataLoader option
// and set leniency to 1.2 in quiz options.
```

### GENERATE_SCRIPT_PATTERN
```typescript
// scripts/generate-kana-strokes.ts — one-time codegen script
// Reads graphicsJaKana.txt line-by-line, parses JSON, builds a Record<string, KanaStrokeEntry>,
// writes to frontend/src/lib/kana-stroke-data.json.
// Run with: npx tsx scripts/generate-kana-strokes.ts path/to/graphicsJaKana.txt
```

### TEST_STRUCTURE
```typescript
// SOURCE: frontend/tests/hanzi-writer-chars.test.ts (current tests — must keep passing)
describe('isWritingSupported', () => {
  it('returns true for common characters', () => {
    expect(isWritingSupported('你')).toBe(true)
    // ...
  })
  it('returns false for non-CJK characters', () => {
    expect(isWritingSupported('hello')).toBe(false)
    // ...
  })
  // ADD NEW CASES:
  // it('returns true for hiragana characters', ...)
  // it('returns true for katakana characters', ...)
  // it('returns true for single hiragana', ...)
  // it('returns true for mixed kana word', ...)
  // it('returns false if kana mixed with non-kana/non-CJK', ...)
})
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `scripts/generate-kana-strokes.ts` | CREATE | One-time codegen script: reads `graphicsJaKana.txt`, emits `kana-stroke-data.json` |
| `frontend/src/lib/kana-stroke-data.json` | GENERATE | Bundled AnimCJK kana stroke data — created by the script above, committed to repo |
| `frontend/src/lib/kana-char-data-loader.ts` | CREATE | `charDataLoader` function wrapping the bundled JSON — called by HanziWriterCanvas |
| `frontend/src/lib/hanzi-writer-chars.ts` | MODIFY | Extend `isWritingSupported` to accept Hiragana (U+3040–U+309F) and Katakana (U+30A0–U+30FF) ranges; export `isKana` helper |
| `frontend/src/components/study/exercises/HanziWriterCanvas.tsx` | MODIFY | Import `isKana` and `kanaCharDataLoader`; pass `charDataLoader` option when character is kana; raise `leniency` to 1.2 for kana |
| `frontend/tests/hanzi-writer-chars.test.ts` | MODIFY | Add kana test cases; existing tests must remain green |

## NOT Building

- Furigana (ruby text above kanji) — separate feature, unrelated to writing practice
- Stroke data for kanji via AnimCJK (kanji already served by hanzi-writer CDN; no change)
- Runtime fetch of AnimCJK data — data must be bundled at build time via the generation script
- Custom stroke-order animation for kana separate from HanziWriter — out of scope
- Kana recognition in the Azure pronunciation assessment path — separate feature

---

## Step-by-Step Implementation

### Step 0 — Generate kana stroke data (prerequisite)

This step must be completed before any code changes are made. The output file `frontend/src/lib/kana-stroke-data.json` must exist before `kana-char-data-loader.ts` imports it.

**0a. Obtain `graphicsJaKana.txt`**

Download from the AnimCJK / makemeahanzi repository:
```
https://raw.githubusercontent.com/skishore/makemeahanzi/master/graphicsJaKana.txt
```
Save it anywhere locally (e.g. `/tmp/graphicsJaKana.txt`). This file is NOT committed to the repo.

**0b. Create the generation script**

Create `scripts/generate-kana-strokes.ts`:

```typescript
#!/usr/bin/env npx tsx
/**
 * generate-kana-strokes.ts
 *
 * One-time script: parses AnimCJK graphicsJaKana.txt and emits
 * frontend/src/lib/kana-stroke-data.json.
 *
 * Usage:
 *   npx tsx scripts/generate-kana-strokes.ts /path/to/graphicsJaKana.txt
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline'

interface KanaEntry {
  character: string
  strokes: string[]
  medians: number[][][]
}

async function main() {
  const inputPath = process.argv[2]
  if (!inputPath) {
    console.error('Usage: npx tsx scripts/generate-kana-strokes.ts <graphicsJaKana.txt>')
    process.exit(1)
  }

  const outputPath = path.resolve(
    __dirname,
    '../frontend/src/lib/kana-stroke-data.json',
  )

  const data: Record<string, KanaEntry> = {}

  const rl = readline.createInterface({
    input: fs.createReadStream(inputPath, { encoding: 'utf8' }),
    crlfDelay: Number.POSITIVE_INFINITY,
  })

  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed)
      continue
    try {
      const entry = JSON.parse(trimmed) as KanaEntry
      if (entry.character && Array.isArray(entry.strokes) && Array.isArray(entry.medians)) {
        data[entry.character] = {
          character: entry.character,
          strokes: entry.strokes,
          medians: entry.medians,
        }
      }
    }
    catch {
      // skip malformed lines
    }
  }

  const count = Object.keys(data).length
  if (count === 0) {
    console.error('No entries parsed — check the input file path.')
    process.exit(1)
  }

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8')
  console.log(`Wrote ${count} kana entries to ${outputPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

**0c. Run the script**

```bash
cd /home/ross-geller/Projects/personal/shadowing-companion
npx tsx scripts/generate-kana-strokes.ts /tmp/graphicsJaKana.txt
```

Expected output: `Wrote N kana entries to .../kana-stroke-data.json` (N ≈ 170–200 characters covering full hiragana + katakana blocks).

---

### Step 1 — Extend `isWritingSupported` and export `isKana`

**File**: `frontend/src/lib/hanzi-writer-chars.ts`

Replace the entire file content:

```typescript
/**
 * hanzi-writer-chars.ts
 *
 * Utilities for determining which characters have HanziWriter stroke data.
 *
 * Supported Unicode ranges:
 *   - CJK Unified Ideographs:   U+4E00–U+9FFF  (served by hanzi-writer CDN)
 *   - Hiragana:                 U+3040–U+309F  (served by bundled kana-stroke-data.json)
 *   - Katakana:                 U+30A0–U+30FF  (served by bundled kana-stroke-data.json)
 */

// CJK Unified Ideographs block: U+4E00–U+9FFF
const CJK_START = 0x4E00
const CJK_END = 0x9FFF

// Hiragana block: U+3040–U+309F
const HIRAGANA_START = 0x3040
const HIRAGANA_END = 0x309F

// Katakana block: U+30A0–U+30FF
const KATAKANA_START = 0x30A0
const KATAKANA_END = 0x30FF

/**
 * Returns true if the code point belongs to either the hiragana or katakana block.
 */
export function isKana(char: string): boolean {
  const cp = char.codePointAt(0)
  if (cp === undefined) return false
  return (
    (cp >= HIRAGANA_START && cp <= HIRAGANA_END)
    || (cp >= KATAKANA_START && cp <= KATAKANA_END)
  )
}

/**
 * Returns true if every character in `word` has available stroke data:
 * - CJK kanji  → data served by hanzi-writer CDN
 * - Hiragana   → data served by bundled kana-stroke-data.json
 * - Katakana   → data served by bundled kana-stroke-data.json
 */
export function isWritingSupported(word: string): boolean {
  if (!word) return false
  return [...word].every((char) => {
    const cp = char.codePointAt(0)
    if (cp === undefined) return false
    return (
      (cp >= CJK_START && cp <= CJK_END)
      || (cp >= HIRAGANA_START && cp <= HIRAGANA_END)
      || (cp >= KATAKANA_START && cp <= KATAKANA_END)
    )
  })
}
```

---

### Step 2 — Create `kana-char-data-loader.ts`

**File**: `frontend/src/lib/kana-char-data-loader.ts`

```typescript
/**
 * kana-char-data-loader.ts
 *
 * Provides a HanziWriter-compatible charDataLoader that serves kana stroke data
 * from the bundled kana-stroke-data.json file (generated from AnimCJK).
 *
 * charDataLoader signature (HanziWriter v3):
 *   (char: string, onLoad: (data) => void, onError: (reason?) => void) => void
 */

import kanaData from './kana-stroke-data.json'

interface KanaStrokeEntry {
  character: string
  strokes: string[]
  medians: number[][][]
}

// The JSON is a Record<string, KanaStrokeEntry>
const kanaMap = kanaData as Record<string, KanaStrokeEntry>

export function kanaCharDataLoader(
  char: string,
  onLoad: (data: KanaStrokeEntry) => void,
  onError: (reason?: string) => void,
): void {
  const entry = kanaMap[char]
  if (entry) {
    onLoad(entry)
  }
  else {
    onError(`No kana stroke data found for character: ${char}`)
  }
}
```

---

### Step 3 — Update `HanziWriterCanvas.tsx` to use `charDataLoader` for kana

**File**: `frontend/src/components/study/exercises/HanziWriterCanvas.tsx`

Two targeted changes are needed:

**Change A**: Add imports at the top of the file (after existing imports):
```typescript
import { isKana } from '../../../lib/hanzi-writer-chars'
import { kanaCharDataLoader } from '../../../lib/kana-char-data-loader'
```

**Change B**: In the `HanziWriter.create(...)` call, conditionally include `charDataLoader`:
```typescript
// BEFORE:
const writer = HanziWriter.create(container, character, {
  width: 200,
  height: 200,
  padding: 10,
  showOutline,
  strokeColor: '#ffffff',
  outlineColor: '#3f3f46',
  drawingColor: '#60a5fa',
  drawingWidth: 4,
})
writer.quiz({
  onComplete: () => { onComplete(hintUsedRef.current) },
  leniency: 1,
  showHintAfterMisses: 3,
  onMistake: (strokeData) => {
    if ((strokeData as any).mistakesOnStroke >= 3) {
      hintUsedRef.current = true
    }
  },
})

// AFTER:
const isKanaChar = [...character].every(ch => isKana(ch))

const writer = HanziWriter.create(container, character, {
  width: 200,
  height: 200,
  padding: 10,
  showOutline,
  strokeColor: '#ffffff',
  outlineColor: '#3f3f46',
  drawingColor: '#60a5fa',
  drawingWidth: 4,
  ...(isKanaChar ? { charDataLoader: kanaCharDataLoader } : {}),
})
writer.quiz({
  onComplete: () => { onComplete(hintUsedRef.current) },
  leniency: isKanaChar ? 1.2 : 1,
  showHintAfterMisses: 3,
  onMistake: (strokeData) => {
    if ((strokeData as any).mistakesOnStroke >= 3) {
      hintUsedRef.current = true
    }
  },
})
```

**Rationale for `isKanaChar` logic**: `character` is guaranteed to be a single character by the time it reaches `HanziWriterCanvas` (the parent `CharacterWritingExercise` iterates chars individually). The spread-then-`every` is defensive and mirrors the same pattern used in `isWritingSupported`.

---

### Step 4 — Extend tests

**File**: `frontend/tests/hanzi-writer-chars.test.ts`

Add the following `it` blocks inside the existing `describe('isWritingSupported', ...)` suite, and add a new `describe('isKana', ...)` suite:

```typescript
// Inside existing describe('isWritingSupported', ...) — add after current cases:

it('returns true for single hiragana character', () => {
  expect(isWritingSupported('あ')).toBe(true)
})

it('returns true for single katakana character', () => {
  expect(isWritingSupported('ア')).toBe(true)
})

it('returns true for hiragana word', () => {
  expect(isWritingSupported('かな')).toBe(true)
})

it('returns true for katakana word', () => {
  expect(isWritingSupported('カタカナ')).toBe(true)
})

it('returns false if kana is mixed with latin', () => {
  expect(isWritingSupported('あA')).toBe(false)
})

// New describe block:
describe('isKana', () => {
  it('returns true for hiragana', () => {
    expect(isKana('あ')).toBe(true)
    expect(isKana('ん')).toBe(true)
  })

  it('returns true for katakana', () => {
    expect(isKana('ア')).toBe(true)
    expect(isKana('ン')).toBe(true)
  })

  it('returns false for CJK kanji', () => {
    expect(isKana('漢')).toBe(false)
  })

  it('returns false for latin characters', () => {
    expect(isKana('a')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isKana('')).toBe(false)
  })
})
```

Also update the import at the top of the test file to include `isKana`:
```typescript
// BEFORE:
import { isWritingSupported } from '../src/lib/hanzi-writer-chars'

// AFTER:
import { isKana, isWritingSupported } from '../src/lib/hanzi-writer-chars'
```

---

## Verification Commands

Run these in order after implementation:

```bash
# 1. Type-check
cd /home/ross-geller/Projects/personal/shadowing-companion/frontend
npx tsc --noEmit

# 2. Unit tests (all must pass, including pre-existing cases)
npx vitest run tests/hanzi-writer-chars.test.ts

# 3. Full test suite (no regressions)
npx vitest run
```

Expected outcomes:
- `tsc --noEmit` exits 0 with no errors
- `hanzi-writer-chars.test.ts` — all existing tests green; all new kana tests green
- Full suite — no new failures introduced

---

## Edge Cases and Constraints

| Scenario | Behaviour | Reason |
|---|---|---|
| Character present in kana Unicode range but absent from `kana-stroke-data.json` | `onError` is called; HanziWriter shows an error state | AnimCJK does not cover every code point in the block (e.g. combining marks, rarely used variants). This is acceptable — the exercise simply cannot render for that character. |
| Mixed kanji+kana word (e.g. "食べる") | `isWritingSupported` returns `true` (all chars in CJK or kana ranges); `isKanaChar` in `HanziWriterCanvas` is `false` (some chars are not kana) so CDN is used for kanji strokes | Each character is rendered individually by the parent component; kanji chars go through CDN, kana chars would need `charDataLoader` — but mixed words are unlikely to reach `CharacterWritingExercise` because the parent only passes single characters |
| Kana with `hanzi.decompose()` call in `CharacterWritingExercise` | `try/catch` returns `[]` | Confirmed: the catch block already handles `null`/`throw` from `hanzi.decompose()` for non-CJK input — no change required |
| `leniency: 1.2` for kana | Slightly more lenient stroke matching | Kana strokes are short curves; the default `1.0` is tuned for complex kanji — raising to `1.2` prevents false negatives on simple strokes without making the exercise trivial |
| JSON bundle size | `kana-stroke-data.json` ≈ 500–800 KB uncompressed, ~100–150 KB gzipped | Acceptable for a Vite-bundled asset; Vite will tree-shake the import at build time if the module is lazy-imported via dynamic `import()`. Consider converting to a dynamic import in `kana-char-data-loader.ts` if bundle budget is exceeded. |

---

## Optional Future Improvement: Dynamic Import for Bundle Budget

If the kana JSON turns out to increase the initial JS bundle beyond acceptable limits (see `web/performance.md` — app page budget is 300 KB gzipped), convert the loader to use a dynamic import:

```typescript
// kana-char-data-loader.ts (dynamic variant)
export function kanaCharDataLoader(
  char: string,
  onLoad: (data: KanaStrokeEntry) => void,
  onError: (reason?: string) => void,
): void {
  import('./kana-stroke-data.json').then((mod) => {
    const kanaMap = mod.default as Record<string, KanaStrokeEntry>
    const entry = kanaMap[char]
    if (entry) {
      onLoad(entry)
    }
    else {
      onError(`No kana stroke data found for character: ${char}`)
    }
  }).catch(() => {
    onError('Failed to load kana stroke data bundle')
  })
}
```

This defers the JSON parse until the first kana writing exercise is rendered. Start with the static import for simplicity; switch to dynamic if bundle metrics show a problem.
