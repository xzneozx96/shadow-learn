# Multi-Language Exercise Support — Design Spec

## Goal

Make all exercises, shadowing, and the processing pipeline language-agnostic so any source language can be added by declaring its capabilities in one place, without touching exercise or pipeline logic.

## Architecture Overview

Four layers of change:

1. **Data model renames** — eliminate Chinese-specific field names (`chinese`, `pinyin`, `sourceSegmentChinese`)
2. **Language capabilities registry** — single extension point per side (backend `language_config.py`, frontend `language-caps.ts`)
3. **Backend romanization provider** — pluggable protocol replacing hardcoded `generate_pinyin`; language-aware LLM prompts
4. **Exercise adaptation** — exercises receive `LanguageCapabilities` object, never branch on raw language strings

---

## Section 1: Data Model Renames

### Backend (`backend/app/models.py`)

| Before | After |
|--------|-------|
| `Segment.chinese: str` | `Segment.text: str` |
| `Segment.pinyin: str` | `Segment.romanization: str` |
| `Word.pinyin: str` | `Word.romanization: str` |

### Frontend (`frontend/src/types.ts`)

| Before | After |
|--------|-------|
| `Segment.chinese: string` | `Segment.text: string` |
| `Segment.pinyin: string` | `Segment.romanization: string` |
| `Word.pinyin: string` | `Word.romanization: string` |
| `VocabEntry.pinyin: string` | `VocabEntry.romanization: string` |
| `VocabEntry.sourceSegmentChinese: string` | `VocabEntry.sourceSegmentText: string` |
| — | `VocabEntry.sourceLanguage: string` (add, captured at save time) |

### Pipeline assembly (`backend/app/routers/lessons.py`)

```python
# Before
"chinese": seg["text"]
# After
"text": seg["text"]
```

### DB migration v3 → v4 (`frontend/src/db/index.ts`)

Bump `DB_VERSION` to 4. Add a branch for `oldVersion < 4` in the `upgrade()` function. The migration uses the `transaction` handle (4th param of idb's upgrade callback) to open cursors on existing stores:

**`segments` store** — each record's value is a `Segment[]` array (the entire lesson's segments stored under `lessonId` as key). Iterate all records, remap each array element:

```typescript
const segStore = transaction.objectStore('segments')
let segCursor = await segStore.openCursor()
while (segCursor) {
  const segments = segCursor.value as any[]
  const migrated = segments.map((s: any) => {
    const { chinese, pinyin, ...rest } = s
    return { ...rest, text: chinese, romanization: pinyin ?? '' }
  })
  await segCursor.update(migrated)
  segCursor = await segCursor.continue()
}
```

**`vocabulary` store** — each record is a flat `VocabEntry`. Iterate and rename:

```typescript
const vocabStore = transaction.objectStore('vocabulary')
let vocabCursor = await vocabStore.openCursor()
while (vocabCursor) {
  const entry = vocabCursor.value as any
  const { pinyin, sourceSegmentChinese, ...rest } = entry
  await vocabCursor.update({
    ...rest,
    romanization: pinyin ?? '',
    sourceSegmentText: sourceSegmentChinese ?? '',
    sourceLanguage: entry.sourceLanguage ?? 'zh-CN',
  })
  vocabCursor = await vocabCursor.continue()
}
```

### Cascade updates (all field name references)

Every component that referenced `.pinyin`, `.chinese`, or `.sourceSegmentChinese` updates to the new names:

| File | Change |
|------|--------|
| `src/components/lesson/SegmentText.tsx` | `span.word.pinyin` → `span.word.romanization` |
| `src/components/lesson/TranscriptPanel.tsx` | `segment.pinyin` → `segment.romanization`; `segment.chinese` → `segment.text` (all occurrences — search, clipboard, TTS, SegmentText prop) |
| `src/components/lesson/LessonWorkbookPanel.tsx` | `entry.pinyin` → `entry.romanization` |
| `src/components/lesson/CompanionPanel.tsx` | `activeSegment.chinese` → `activeSegment.text` |
| `src/components/shadowing/ShadowingRevealPhase.tsx` | `segment.pinyin` → `segment.romanization` |
| `src/components/shadowing/ShadowingModePicker.tsx` | `startSegment.chinese` → `startSegment.text` |
| `src/components/shadowing/ShadowingSessionSummary.tsx` | `seg?.chinese` → `seg?.text` |
| `src/components/workbook/WordCard.tsx` | `entry.pinyin` → `entry.romanization` |
| `src/components/study/exercises/CharacterWritingExercise.tsx` | `entry.pinyin` → `entry.romanization` |
| `src/components/study/exercises/PinyinRecallExercise.tsx` | `entry.pinyin` → `entry.romanization` (+ renamed to `RomanizationRecallExercise.tsx`) |
| `src/contexts/VocabularyContext.tsx` | `sourceSegmentChinese: segment.chinese` → `sourceSegmentText: segment.text`; add `sourceLanguage: lesson.sourceLanguage ?? 'zh-CN'` |

---

## Section 2: Language Capabilities Registry

### Backend — `backend/app/services/language_config.py` (new file)

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
    return (
        _LANGUAGE_CONFIG.get(source_language)
        or _LANGUAGE_CONFIG.get(source_language.split("-")[0])
        or _LANGUAGE_CONFIG["zh-CN"]
    )
```

### Frontend — `frontend/src/lib/language-caps.ts` (new file)

```typescript
export type RomanizationSystem = 'pinyin' | 'ipa' | 'romaji' | 'none'
export type InputMode = 'ime-chinese' | 'standard'

export interface LanguageCapabilities {
  romanizationSystem: RomanizationSystem
  romanizationLabel: string        // shown in exercise title: "Pinyin Recall", "IPA Recall"
  romanizationPlaceholder: string  // input hint in RomanizationRecallExercise
  hasCharacterWriting: boolean     // show/hide CharacterWritingExercise
  inputMode: InputMode             // drives LanguageInput: ChineseInput vs plain Input
  dictationPlaceholder: string     // placeholder in DictationExercise + ShadowingDictationPhase
  languageName: string             // "Chinese", "English" — informational
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

**Adding a new language** = one entry in each file. No exercise or pipeline code changes.

---

## Section 3: Backend Romanization Provider

### New file `backend/app/services/romanization_provider.py`

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
        import eng_to_ipa
        return eng_to_ipa.convert(text)

    def romanize_word(self, word: str) -> str:
        import eng_to_ipa
        return eng_to_ipa.convert(word)


class NullRomanizationProvider:
    def romanize_text(self, text: str) -> str:
        return ""

    def romanize_word(self, word: str) -> str:
        return ""


def get_romanization_provider(source_language: str) -> RomanizationProvider:
    if source_language.startswith("zh"):
        return ChineseRomanizationProvider()
    if source_language.startswith("en"):
        return EnglishRomanizationProvider()
    return NullRomanizationProvider()
```

Add `eng-to-ipa==0.0.2` to `backend/requirements.txt` (the package is a thin offline converter — sufficient for segment-level IPA; can be swapped for `phonemizer` later if higher accuracy is needed).

### Pipeline change (`backend/app/routers/lessons.py`)

```python
# Before
is_chinese = source_language.startswith("zh")
for seg in segments:
    seg_pinyin = generate_pinyin(seg["text"]) if is_chinese else ""
    enriched_segments.append({**seg, "pinyin": seg_pinyin})

# After
from app.services.romanization_provider import get_romanization_provider
romanizer = get_romanization_provider(source_language)
for seg in segments:
    enriched_segments.append({**seg, "romanization": romanizer.romanize_text(seg["text"])})
```

### Language-aware LLM prompts

**`translation.py`** — add `source_language: str` parameter, update prompt:

```python
from app.services.language_config import get_language_config

lang_cfg = get_language_config(source_language)
# "You are a professional translator specializing in Chinese." →
f"You are a professional translator specializing in {lang_cfg['language_name']}."
```

**`vocabulary.py`** — add `source_language: str` parameter, update prompt:

```python
from app.services.language_config import get_language_config

lang_cfg = get_language_config(source_language)
# "You are a Chinese language teacher." →
f"You are a {lang_cfg['language_name']} language teacher."
# Pinyin instruction →
f'- "romanization": {lang_cfg["romanization_description"]}\n'
```

**`quiz.py`** — currently hardcodes `"You are a Mandarin Chinese teacher…"`. Add `source_language: str` parameter and apply the same `get_language_config` pattern to the quiz generation prompt.

All three receive `source_language` propagated from the pipeline call in `lessons.py`.

### Backend tests

`backend/tests/test_translation.py` and vocabulary/quiz tests must be updated to pass `source_language` wherever the function signatures change.

---

## Section 4: Exercise Adaptation

### `ExerciseMode` type update (`frontend/src/components/study/ModePicker.tsx`)

Rename the `'pinyin'` mode ID to `'romanization-recall'` throughout:

```typescript
// ExerciseMode union type
export type ExerciseMode = 'cloze' | 'dictation' | 'romanization-recall' | 'pronunciation' | 'reconstruction' | 'writing' | 'translation' | 'mixed'

// MODES array entry
{
  id: 'romanization-recall',
  name: `${caps.romanizationLabel} Recall`,  // "Pinyin Recall" / "IPA Recall" / "Romaji Recall"
  desc: `See the word, type its ${caps.romanizationLabel || 'romanization'}.`,
  // hidden when caps.romanizationSystem === 'none'
}
```

`ModePicker` receives `caps: LanguageCapabilities` as a prop so it can render the dynamic label and hide the mode when `caps.romanizationSystem === 'none'`.

### `frontend/src/components/ui/LanguageInput.tsx` (new file)

`ChineseInput` has a non-standard props interface (`wrapperClassName`, narrowed `value: string`). `LanguageInput` must accommodate both shapes:

```tsx
import type { InputMode } from '@/lib/language-caps'
import type { ComponentProps } from 'react'
import { ChineseInput } from './ChineseInput'
import { Input } from './input'

interface LanguageInputProps extends ComponentProps<typeof Input> {
  inputMode: InputMode
  wrapperClassName?: string
}

export function LanguageInput({ inputMode, wrapperClassName, value, onChange, ...props }: LanguageInputProps) {
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

### `frontend/src/lib/romanization-utils.ts` (new file)

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

### `StudySession.tsx`

- Derives `caps = getLanguageCaps(meta?.sourceLanguage)` from the lesson meta already loaded via `useLesson`
- Passes `caps` to all exercises and to `ModePicker`
- Update the `Question` interface's `translationData` shape (inline type in this file): rename `sentence: { chinese: string, english: string }` → `sentence: { text: string, romanization: string }` and direction values from `'en-to-zh' | 'zh-to-en'` to use the lesson's `sourceLanguage`
- The fallback path that maps failed AI exercises back to a simpler type must use `'romanization-recall'` not `'pinyin'`: `(t === 'cloze' || t === 'translation') ? 'romanization-recall' : t`. The corresponding render condition `q.type === 'pinyin'` must also be updated to `'romanization-recall'`
- `distributeExercises()` gains `caps` parameter. Both the language-level gate **and** the per-character availability check must remain for writing:

```typescript
function distributeExercises(entries: VocabEntry[], keys: DecryptedKeys, caps: LanguageCapabilities) {
  const available: ExerciseMode[] = ['dictation', 'reconstruction']

  if (caps.romanizationSystem !== 'none') available.push('romanization-recall')

  const hasWriting = caps.hasCharacterWriting && entries.some(e => [...e.word].some(isWritingSupported))
  if (hasWriting) available.push('writing')

  if (keys.azureSpeechKey) available.push('pronunciation')
  if (keys.openrouterApiKey) available.push('cloze', 'translation')
  // distribute as before
}
```

### `ShadowingPanel.tsx`

Receives `lesson: LessonMeta`, derives `caps = getLanguageCaps(lesson.sourceLanguage)`, passes to `ShadowingDictationPhase`.

### Per-exercise changes

**`PinyinRecallExercise` → `RomanizationRecallExercise`** (file rename)
- Props gain `caps: LanguageCapabilities`
- Title: `${caps.romanizationLabel} Recall`
- Info description: adapts to language
- Placeholder: `caps.romanizationPlaceholder`
- Comparison: `compareRomanization(value, entry.romanization, caps.romanizationSystem)`
- `entry.pinyin` → `entry.romanization`

**`CharacterWritingExercise`**
- Props gain `caps: LanguageCapabilities`
- `entry.pinyin` → `entry.romanization`
- Language gate handled in `distributeExercises` (combined with per-character `isWritingSupported` check as shown above)

**`DictationExercise`**
- Props gain `caps: LanguageCapabilities`
- Replace `<ChineseInput>` → `<LanguageInput inputMode={caps.inputMode}>`
- Placeholder: `caps.dictationPlaceholder`
- `entry.sourceSegmentChinese` → `entry.sourceSegmentText`

**`ReconstructionExercise`**
- `entry.sourceSegmentChinese` → `entry.sourceSegmentText` (only change — logic is language-agnostic)

**`TranslationExercise`**
- Local `Sentence` interface: rename `chinese: string` → `text: string`, `pinyin: string` → `romanization: string`
- Direction labels: use `caps.languageName` instead of hardcoded `'chinese'`/`'english'` strings
- Wire format to backend (`source_language` / `target_language` values): use `lesson.sourceLanguage` rather than the hardcoded `'chinese'` literal
- Input component: `<LanguageInput inputMode={caps.inputMode}>` when typing in source language

**`ShadowingDictationPhase`**
- Props gain `caps: LanguageCapabilities`
- Replace `<ChineseInput placeholder="输入汉字…">` → `<LanguageInput inputMode={caps.inputMode} placeholder={caps.dictationPlaceholder}>`

---

## Extension Checklist — Adding a New Language

1. Add entry to `backend/app/services/language_config.py`
2. Add entry to `frontend/src/lib/language-caps.ts`
3. If it has romanization: add `XxxRomanizationProvider` in `romanization_provider.py` + one `if` in `get_romanization_provider()`
4. Add the relevant Python library to `requirements.txt` if needed
5. Done — all exercises, pipeline, and UI adapt automatically

---

## Files Changed

### Backend
- `app/models.py` — field renames (`chinese`→`text`, `pinyin`→`romanization`)
- `app/routers/lessons.py` — pipeline uses romanizer; passes `source_language` to translate, vocab, quiz calls; `"chinese"` key → `"text"`
- `app/services/translation.py` — add `source_language` param, language-aware prompt
- `app/services/vocabulary.py` — add `source_language` param, language-aware prompt + field name in response
- `app/services/quiz.py` — add `source_language` param, language-aware prompt
- `app/services/romanization_provider.py` — **new**
- `app/services/language_config.py` — **new**
- `requirements.txt` — add `eng-to-ipa==0.0.2`
- `tests/test_translation.py` — update for new `source_language` param
- `tests/test_lessons_router.py` — update for renamed fields
- `tests/test_vocabulary.py` — update fixtures: `"pinyin"` → `"romanization"` field name, add `source_language` param to extraction calls

### Frontend
- `src/types.ts` — field renames, add `VocabEntry.sourceLanguage`
- `src/db/index.ts` — `DB_VERSION` → 4, migration branch (array-per-record for segments, flat records for vocabulary)
- `src/lib/language-caps.ts` — **new**
- `src/lib/romanization-utils.ts` — **new**
- `src/components/ui/LanguageInput.tsx` — **new**
- `src/contexts/VocabularyContext.tsx` — field renames at save time, add `sourceLanguage`
- `src/components/study/ModePicker.tsx` — rename `'pinyin'` → `'romanization-recall'` in type + MODES array; receives `caps` prop for dynamic labels
- `src/components/study/StudySession.tsx` — derive and thread `caps`; update `distributeExercises`; rename `'pinyin'` → `'romanization-recall'` in fallback path and render condition; update `Question.translationData` interface
- `src/components/study/exercises/PinyinRecallExercise.tsx` → **renamed** `RomanizationRecallExercise.tsx` — caps-driven title, placeholder, comparison
- `src/components/study/exercises/CharacterWritingExercise.tsx` — field rename, caps prop
- `src/components/study/exercises/DictationExercise.tsx` — LanguageInput, caps, field rename
- `src/components/study/exercises/ReconstructionExercise.tsx` — field rename only
- `src/components/study/exercises/TranslationExercise.tsx` — local Sentence interface rename, caps, LanguageInput, fix wire-format language values
- `src/components/shadowing/ShadowingPanel.tsx` — derive and thread caps
- `src/components/shadowing/ShadowingDictationPhase.tsx` — LanguageInput, caps
- `src/components/shadowing/ShadowingModePicker.tsx` — field rename, caps prop
- `src/components/shadowing/ShadowingRevealPhase.tsx` — `segment.pinyin` → `segment.romanization`
- `src/components/shadowing/ShadowingSessionSummary.tsx` — `seg?.chinese` → `seg?.text`
- `src/components/lesson/SegmentText.tsx` — field rename
- `src/components/lesson/TranscriptPanel.tsx` — field renames (all `segment.chinese` and `segment.pinyin` occurrences)
- `src/components/lesson/LessonWorkbookPanel.tsx` — field rename
- `src/components/lesson/CompanionPanel.tsx` — `activeSegment.chinese` → `activeSegment.text`
- `src/components/workbook/WordCard.tsx` — field rename
