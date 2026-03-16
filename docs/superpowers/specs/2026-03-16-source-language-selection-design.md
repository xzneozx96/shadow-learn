# Spec: Source Language Selection for Deepgram Transcription

**Date:** 2026-03-16
**Status:** Approved

## Problem

The Deepgram transcription service has `"language": "zh-CN"` hardcoded in `_DEEPGRAM_PARAMS`. Users who upload or link videos in other languages get incorrect transcriptions. The language of the video (source language) must be selectable by the user at lesson creation time.

## Approach

Single shared `LANGUAGES` constant used by both the "Video Language" (source) and "Translation Language" (target) selectors. Language codes are BCP-47, compatible with both Deepgram's nova-2 model and OpenRouter. The selected source language is threaded from the frontend form through the API request to `transcribe_audio_deepgram()`.

---

## Shared Constant

**New file:** `frontend/src/lib/constants.ts`

```ts
export const LANGUAGES = [
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
  { value: 'zh-TW', label: 'Chinese (Traditional)' },
  { value: 'en',    label: 'English' },
  { value: 'es',    label: 'Spanish' },
  { value: 'fr',    label: 'French' },
  { value: 'de',    label: 'German' },
  { value: 'ja',    label: 'Japanese' },
  { value: 'ko',    label: 'Korean' },
  { value: 'pt',    label: 'Portuguese' },
  { value: 'ru',    label: 'Russian' },
  { value: 'vi',    label: 'Vietnamese' },
]
```

`CreateLesson.tsx` removes its local `LANGUAGES` definition and imports from `@/lib/constants`.

---

## Frontend Changes

### `CreateLesson.tsx`

- Add `sourceLanguage` state, default `"zh-CN"` (preserves current behaviour for existing users)
- Add "Video Language" `<Select>` above the existing "Translation Language" selector, using `LANGUAGES`
- YouTube submit: add `source_language: sourceLanguage` to JSON body
- Upload submit: `formData.append('source_language', sourceLanguage)`
- Pass `sourceLanguage` when saving `LessonMeta` to IndexedDB

### `types.ts` — `LessonMeta`

Add optional field:
```ts
sourceLanguage?: string
```
Optional for backwards compatibility with lessons already stored in IndexedDB.

---

## Backend Changes

### `models.py` — `LessonRequest`

```python
source_language: str = "zh-CN"
```

Default of `"zh-CN"` ensures safety for any existing or legacy clients.

### `routers/lessons.py` — upload endpoint

```python
source_language: str = Form("zh-CN")
```

Both pipeline functions (`_process_youtube_lesson`, `_process_upload_lesson`) pass `source_language` / `request.source_language` to `transcribe_audio_deepgram()`.

### `services/transcription.py` — `transcribe_audio_deepgram()`

Signature change:
```python
async def transcribe_audio_deepgram(audio_path: Path, api_key: str, language: str) -> list[_Segment]:
```

Remove `"language"` from module-level `_DEEPGRAM_PARAMS`. Build params locally:
```python
params = {**_DEEPGRAM_PARAMS, "language": language}
```

Pass `params` to the HTTP call instead of `_DEEPGRAM_PARAMS` directly.

---

## Data Flow

```
CreateLesson (sourceLanguage state)
  → POST /api/lessons/generate        { source_language: "zh-CN" }
  → POST /api/lessons/generate-upload  form field source_language="zh-CN"
      → LessonRequest / form params
          → _process_youtube_lesson(request, ...)
          → _process_upload_lesson(..., source_language, ...)
              → transcribe_audio_deepgram(path, key, language)
                  → Deepgram API params: { language: "zh-CN", model: "nova-2", ... }
```

---

## Tests

Existing transcription tests in `test_transcription.py` are updated to pass an explicit `language="zh-CN"` argument. No behaviour change — just making the previously implicit value explicit.

---

## Out of Scope

- Auto language detection (Deepgram `detect_language`) — not trusted, excluded by design
- Separate source/translation language lists — unnecessary, same BCP-47 codes work for both
- Persisting `sourceLanguage` to any server-side store — lesson data is client-side only
