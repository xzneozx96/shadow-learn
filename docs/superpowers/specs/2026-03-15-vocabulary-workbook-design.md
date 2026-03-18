# Vocabulary Workbook — Design Spec

**Date:** 2026-03-15
**Status:** Approved

---

## Overview

A Vocabulary Workbook feature that lets users save words encountered during shadowing lessons, then reinforce them through AI-generated interactive study sessions. Words are grouped by source lesson. Study sessions support five exercise types plus a Mixed mode.

---

## Scope (v1)

**In scope:**
- Save individual words from the word tooltip in the lesson transcript
- Vocabulary Workbook page (`/vocabulary`) — words grouped by lesson
- Five exercise types: Scenario Cloze, Dictation, Pinyin Recall, Pronunciation Referee, Sentence Reconstruction
- Mixed Practice mode (shuffled, all exercise types)
- Adjustable session length (5–20 questions, default 10)
- Azure Pronunciation Assessment integration for Pronunciation Referee
- Source context link from every exercise ("Jump to source segment in video")

**Out of scope for v1 (planned later):**
- Topic/category organization
- Flashcard mode with spaced repetition / session history / score tracking
- AI Conversation practice
- Tone Drill, Listen & Identify exercises

---

## Data Model

### New IndexedDB store: `vocabulary`

DB version bumped from **2 → 3**. The `upgrade` callback adds a new `oldVersion < 3` block **alongside** the existing `oldVersion < 2` block — both branches must be preserved so users upgrading from DB v1 get both migrations applied in sequence.

```typescript
interface VocabEntry {
  id: string                       // crypto.randomUUID()
  word: string                     // "今天"
  pinyin: string                   // "jīntiān"
  meaning: string                  // "today"
  usage: string                    // "今天天气很好。"
  sourceLessonId: string           // "lesson_abc123"
  sourceLessonTitle: string        // "HSK 3 — Daily Conversations Ep.12"
  sourceSegmentId: string          // "seg_003"
  sourceSegmentChinese: string     // "今天天气非常好！"
  sourceSegmentTranslation: string // snapshot of Segment.translations[activeLang] at save time
  createdAt: string                // ISO 8601 timestamp
}
```

```typescript
// In db.ts upgrade callback (oldVersion < 3):
const store = db.createObjectStore('vocabulary', { keyPath: 'id' })
store.createIndex('by-lesson', 'sourceLessonId', { unique: false })
store.createIndex('by-date', 'createdAt', { unique: false })
```

Query: `db.getAllFromIndex('vocabulary', 'by-lesson', lessonId)` for lesson-grouped view.

---

## Saving Words

### Entry point: word tooltip in `SegmentText`

A bookmark icon (🔖) is added alongside Copy and Play in the word tooltip.

**Prop contract:** `SegmentText` remains a pure component and receives:
```typescript
onSaveWord?: (word: Word, segment: Segment) => void
// Word is the existing type from types.ts: { word: string, pinyin: string, meaning: string, usage: string }
// Segment is the existing type from types.ts: { id, start, end, chinese, pinyin, translations: Record<string,string>, words: Word[], wordTimings? }
```
`TranscriptPanel` constructs and passes this callback. It closes over the current `segment` object and `activeLang` (both already available in `TranscriptPanel`'s local state — `activeLang` is the language toggle state that `TranscriptPanel` owns). The `useVocabulary.save` call in the callback receives all the context it needs to build a `VocabEntry`.

`sourceSegmentTranslation` is captured as `segment.translations[activeLang]` at save time, where `segment.translations` is `Record<string, string>` (confirmed on the existing `Segment` type in `types.ts`). This is a snapshot — does not update if the user later changes language.

**Saved state detection:** `isSaved(word.word, segment.sourceLessonId)` — if true, icon renders filled; click is a silent no-op with tooltip "Already in Workbook."

Toast shown on save: "Saved to Workbook."

---

## Navigation

- The **Workbook** link appears in the `Layout` nav component only (between Library and Settings). `LessonView` has its own full-screen layout and does not use `Layout` — no Workbook link appears within a lesson view.
- Routes: `/vocabulary`, `/vocabulary/:lessonId/study`

### Source segment deep-link

"Jump to source" links navigate to `/lesson/:lessonId?segmentId=seg_003`.

`LessonView` reads `segmentId` via `useSearchParams` (react-router-dom). A `useEffect` watching `[segments, segmentId]` fires after segments are loaded (`segments.length > 0`) — it scrolls the matching segment into view in the transcript panel and seeks the video player to `segment.start`. The effect does nothing if `segmentId` is absent.

---

## Workbook Page (`/vocabulary`)

### Layout

- **Header:** "My Workbook" + word count + lesson count
- **Stats row:** 3 stat cards — Words saved, Lessons, Last saved (max `createdAt` across all entries). Session history stats (studied this week, best score) deferred to v2.
- **Search bar:** filters Chinese characters or meaning across all lessons
- **Lesson groups:** collapsible cards, sorted by most recently saved entry per lesson

### Lesson group card

- Thumbnail + title + word count + last saved date + **Study** button
- 5-word preview grid (hanzi, pinyin, meaning, source timestamp)
- "Show all N words" expand toggle

### Design

Follows the existing app's **achromatic glass system** exactly — no custom colors or purple accents:

- **Background:** `oklch(0.08 0 0)` + soft radial vignette (`oklch(1 0 0 / 0.03)`)
- **Cards:** `oklch(1 0 0 / 0.04)` fill, `backdrop-filter: blur(20px)`, `1px solid oklch(1 0 0 / 0.08)` border, inset top highlight gradient, `border-radius: calc(0.625rem * 1.6)`
- **Surface (interactive elements):** `oklch(1 0 0 / 0.06)`
- **Hover state:** `oklch(1 0 0 / 0.10)`
- **Primary button (Study, Check, Start):** white bg `oklch(0.97 0 0)` with dark text `oklch(0.08 0 0)` — same as app's `variant="default"`
- **Ghost button:** `var(--surface)` bg + `var(--border)` outline
- **Spacing:** 8px base grid, consistent with existing components
- **Typography:** Inter + Noto Sans SC, `text-sm` / `text-sm` hierarchy, `text-muted-foreground` for secondary text
- **Score colours:** semantic only — muted oklch green (`oklch(0.75 0.14 142)`), yellow (`oklch(0.85 0.16 90)`), red (`oklch(0.65 0.18 25)`)
- **Record button:** muted red `oklch(0.65 0.18 25)` — semantic destructive colour, same as app's destructive token

---

## Study Session (`/vocabulary/:lessonId/study`)

### Flow

1. **Mode picker** — choose exercise type + question count
2. **Exercise loop** — progress bar (N / total); each question full-screen
3. **Summary screen** — score, words to review, Study again / Back

### Mode picker

3×2 grid of focused modes + 1 full-width Mixed card (pre-selected, "Recommended" badge). Question count −/+ (5–20, default 10).

| Mode | Icon | Description |
|------|------|-------------|
| Cloze | ✍️ | Fill blanks in AI-generated story |
| Dictation | 🎧 | Hear TTS audio, type what you heard |
| Pinyin Recall | 🔤 | See character, type pinyin with tones |
| Pronunciation Referee | 🎤 | Pronounce sentence, get Azure scored |
| Sentence Rebuild | 🔀 | Type scrambled source sentence in order |
| Mixed | 🎲 | All types shuffled — **Recommended** |

---

## Exercise Types

### Which exercises need the backend?

| Exercise | Backend | How |
|----------|---------|-----|
| Scenario Cloze | Yes | `/api/quiz/generate` (`exercise_type: "cloze"`) |
| Pronunciation Referee | Yes | `/api/quiz/generate` (`exercise_type: "pronunciation_sentence"`) + `/api/pronunciation/assess` |
| Dictation | No | existing `/api/tts` on `sourceSegmentChinese` |
| Pinyin Recall | No | client-side, uses saved `pinyin` field |
| Sentence Reconstruction | No | client-side, uses `Segment.words` for tokens |

### 1. Scenario Cloze

- Backend generates a short story using up to 5 words from the session pool; blanks marked `{{word}}`
- Blanks rendered as inline `<input>` elements; user types Chinese characters freely
- Submit: correct = green, wrong = red + correct answer revealed
- Each blank shows source context pill: "📍 View in video at 0:12 →"

### 2. Dictation

- `/api/tts` plays audio for `sourceSegmentChinese` (TTS, not raw video audio — consistent quality, simpler from the study session page)
- User types what they hear in Chinese characters
- **Pinyin mode toggle:** switches expected answer to pinyin
- Replay button always available

### 3. Pinyin Recall

- Large character display + English meaning
- User types pinyin; two accepted formats: tone marks (`jīntiān`) or tone numbers (`jin1tian1`)
- On submit: correct pinyin shown + TTS plays the word

### 4. Pronunciation Referee

- AI-generated sentence displayed (hanzi + pinyin + translation)
- **Recording loop:**
  1. **Record** → waveform animates (MediaRecorder, WebM/Opus)
  2. **Stop** → waveform freezes; **Playback** button activates
  3. User listens back; may re-record freely (attempt counter shown)
  4. **Submit for scoring** — disabled until ≥ 1 recording; POSTs to `/api/pronunciation/assess`
- Results: 4 overall scores + per-word score bars (green ≥80, yellow 60–79, red <60) + tone error notes
- "Try again" re-enters the recording loop for the same sentence; "Next" advances

### 5. Sentence Reconstruction

- Tokens: `Segment.words: Word[]` (confirmed field on the existing `Segment` type in `types.ts`) filtered to entries whose `.word` string appears in `sourceSegmentChinese`, sorted by position of first occurrence. Tokens are word-level. Gaps in coverage are omitted from the chip strip; the user types the full sentence from memory.
- Chips are shuffled and shown above the input; a chip dims when the substring it represents has been typed anywhere in the input field (simple substring match, not order-aware — chips are hints only)
- User types the full reconstructed sentence in a free-text input; press Enter or click Check to submit
- Submit: character-by-character diff against `sourceSegmentChinese` — matching runs shown in green, deviations in red
- Source context pill: "📍 HSK 3 Ep.12 · seg 3 — where you saved 非常"

### Mixed Practice

Shuffles all 5 exercise types. When session length ≥ 5, each type appears at least once. Word selection is random from the lesson's saved pool.

**Azure not configured:** detected when `keys.azureSpeechKey` is absent/empty. Pronunciation Referee is replaced by Pinyin Recall. A one-time banner (session-memory state, not persisted) is shown at the start: "Pronunciation exercises are unavailable — add an Azure Speech Key in Settings."

---

## Backend API

### `POST /api/quiz/generate`

```python
# Request — cloze
{
  "openai_api_key": "<forwarded from frontend>",
  "words": [{ "word": "今天", "pinyin": "jīntiān", "meaning": "today", "usage": "..." }],
  "exercise_type": "cloze",
  "story_count": 1    # stories generated; each uses up to 5 words
}
# Response
{ "exercises": [{ "story": "小明说{{今天}}...", "blanks": ["今天", "非常"] }] }

# Request — pronunciation sentence
{
  "openai_api_key": "<forwarded from frontend>",
  "words": [{ "word": "今天", ... }],
  "exercise_type": "pronunciation_sentence",
  "count": 5
}
# Response
{ "exercises": [{ "sentence": "今天天气非常好！", "translation": "The weather is extremely nice today!" }] }
```

Uses `openai_api_key` (same field name as in existing `/api/chat` and `/api/lessons/generate`). Model: same as existing chat model config.

### `POST /api/pronunciation/assess`

```
Content-Type: multipart/form-data
Exact field names (frontend and backend must agree):
  audio          : File   — WebM blob (field name: "audio")
  reference_text : str    — the sentence to assess against
  language       : str    — "zh-CN"
  azure_key      : str    — forwarded per-request, never stored backend-side
  azure_region   : str    — e.g. "eastus"
```

Backend pipeline:
1. Save WebM to a temp file
2. `ffmpeg -i input.webm -ar 16000 -ac 1 -f wav output.wav` (existing ffmpeg)
3. Call Azure Cognitive Services Speech SDK (`azure-cognitiveservices-speech` Python package — new `requirements.txt` dependency; requires `libssl` and `libasound2` on Linux. **Implementation task:** verify these libraries are present in the existing Docker image by running `dpkg -l | grep -E 'libssl|libasound'` in a container, and add `apt-get install` steps to the Dockerfile if missing.)
4. Return scores

```python
# Response
{
  "overall": { "accuracy": 88, "fluency": 74, "completeness": 100, "prosody": 61 },
  "words": [
    { "word": "今天", "accuracy": 95, "error_type": null, "error_detail": null },
    { "word": "非常", "accuracy": 61, "error_type": "Mispronunciation", "error_detail": "fēi — said tone 2, expected tone 1" }
  ]
}
```

### Azure key + region storage

`DecryptedKeys` gains two **optional** fields. Existing required fields stay required:

```typescript
interface DecryptedKeys {
  openaiApiKey: string        // existing — required, unchanged
  deepgramApiKey?: string     // existing
  minimaxApiKey?: string      // existing
  azureSpeechKey?: string     // new
  azureSpeechRegion?: string  // new (e.g. "eastus")
}
```

Existing encrypted blobs remain valid on next unlock — `azureSpeechKey` / `azureSpeechRegion` will simply be `undefined` until the user adds them. No migration or re-encryption needed.

Settings page gains: **Azure Speech Key** + **Azure Speech Region** text inputs (same UX as existing key fields). Values forwarded in every `/api/pronunciation/assess` multipart request — never stored server-side.

---

## Frontend Architecture

### New files

| Path | Purpose |
|------|---------|
| `frontend/src/pages/WorkbookPage.tsx` | `/vocabulary` |
| `frontend/src/pages/StudySessionPage.tsx` | `/vocabulary/:lessonId/study` |
| `frontend/src/components/workbook/LessonGroup.tsx` | Collapsible lesson word group card |
| `frontend/src/components/workbook/WordCard.tsx` | Individual word preview cell |
| `frontend/src/components/study/ModePicker.tsx` | Exercise type + count selector |
| `frontend/src/components/study/ProgressBar.tsx` | Session progress indicator |
| `frontend/src/components/study/exercises/ClozeExercise.tsx` | Scenario Cloze |
| `frontend/src/components/study/exercises/DictationExercise.tsx` | Dictation |
| `frontend/src/components/study/exercises/PinyinRecallExercise.tsx` | Pinyin Recall |
| `frontend/src/components/study/exercises/PronunciationReferee.tsx` | Pronunciation + Azure |
| `frontend/src/components/study/exercises/ReconstructionExercise.tsx` | Sentence Rebuild |
| `frontend/src/components/study/SessionSummary.tsx` | End-of-session results |
| `frontend/src/hooks/useVocabulary.ts` | IndexedDB CRUD; gets `db` from `AuthContext` |
| `frontend/src/lib/pinyin-utils.ts` | Tone mark ↔ tone number normalisation |

### Modified files

| Path | Change |
|------|--------|
| `frontend/src/components/lesson/SegmentText.tsx` | Add `onSaveWord?: (word: Word, segment: Segment) => void` prop + bookmark button |
| `frontend/src/components/lesson/TranscriptPanel.tsx` | Wire `onSaveWord` via `useVocabulary`; close over `segment` + `activeLang` |
| `frontend/src/components/lesson/LessonView.tsx` | Read `?segmentId=` param via `useSearchParams`; scroll + seek on load |
| `frontend/src/components/Layout.tsx` | Add Workbook nav link |
| `frontend/src/components/onboarding/Setup.tsx` | Add Azure Speech Key + Region fields |
| `frontend/src/lib/db.ts` | Add `vocabulary` store + indexes; bump version 2 → 3 |
| `frontend/src/types.ts` | Extend `DecryptedKeys` with optional azure fields; add `VocabEntry` |
| App router | Add `/vocabulary` and `/vocabulary/:lessonId/study` routes |
| `backend/app/main.py` | Register `/api/quiz/generate` and `/api/pronunciation/assess` |
| `backend/app/config.py` | Add `AZURE_SPEECH_REGION` default; key forwarded per-request |
| `backend/requirements.txt` | Add `azure-cognitiveservices-speech` |

### `useVocabulary` hook

```typescript
// Gets db from AuthContext — same pattern as all other DB hooks
const { entries, entriesByLesson, save, remove, isSaved } = useVocabulary()

// save signature
save(word: Word, segment: Segment, lesson: LessonMeta, activeLang: string): Promise<void>
```

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Quiz generation fails | Retry button; fallback exercise (Pinyin Recall) shown |
| Azure assessment fails | Error message + "Try again"; session progress not blocked |
| Azure not configured | Pronunciation Referee replaced by Pinyin Recall in Mixed; one-time banner |
| No words saved for lesson | Workbook page empty state with CTA to open a lesson |
| TTS unavailable in Dictation | "Audio unavailable" + text fallback of `sourceSegmentChinese` |
| Duplicate save | Silent no-op; bookmark icon stays filled |

---

## Future (v2)

- Topic/category tags for cross-lesson organisation
- Session history store + score tracking ("studied this week", best score stats)
- Spaced repetition scheduling in Mixed mode (bias toward due words)
- Tone Drill rapid-fire exercise
- Listen & Identify exercise
- Flashcard mode
- AI Conversation practice using saved vocabulary
