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

`CreateLesson.tsx` removes its local `LANGUAGES` definition and imports from `@/lib/constants`. Note: the shared list includes Chinese (`zh-CN`, `zh-TW`) which were not in the original 9-entry local list — Chinese will become selectable as a translation language for the first time, which is intentional.

---

## Frontend Changes

### `CreateLesson.tsx`

- Add `sourceLanguage` state, default `"zh-CN"` (preserves current behaviour for existing users)
- Add "Video Language" `<Select>` above the existing "Translation Language" selector, using `LANGUAGES`
- YouTube submit: add `source_language: sourceLanguage` to JSON body
- Upload submit: `formData.append('source_language', sourceLanguage)`
- Pass `sourceLanguage` when saving the stub `LessonMeta` to IndexedDB at job-submission time (the value is known then and does not need to come from the backend result — the backend pipeline result JSON does not need to include it)

### `types.ts` — `LessonMeta`

Add optional field:
```ts
sourceLanguage?: string
```
Optional for backwards compatibility with lessons already stored in IndexedDB. Stored so it can be displayed in the library card or lesson header in future without re-processing.

---

## Backend Changes

### `models.py` — `LessonRequest`

```python
source_language: str = "zh-CN"
```

This field is used only by the YouTube `/generate` endpoint (which deserialises `LessonRequest`). The upload endpoint uses `Form(...)` parameters directly — the upload path gets its own independent `source_language: str = Form("zh-CN")` and does not use this model.

Default of `"zh-CN"` ensures safety for any existing or legacy clients. No explicit allowlist validator — the frontend constrains values to the known `LANGUAGES` list; any invalid value reaching Deepgram produces a clear API error.

### `routers/lessons.py` — upload endpoint

Full updated signature for `generate_lesson_upload`:
```python
async def generate_lesson_upload(
    background_tasks: BackgroundTasks,
    file: UploadFile,
    translation_languages: str = Form(...),
    openrouter_api_key: str = Form(...),
    deepgram_api_key: str | None = Form(None),
    source_language: str = Form("zh-CN"),
) -> dict:
```

`source_language` is forwarded in the `background_tasks.add_task(...)` call as a new sixth argument:
```python
background_tasks.add_task(
    _process_upload_lesson,
    file,
    languages,
    openrouter_api_key,
    job_id,
    deepgram_api_key,
    source_language,   # new
)
```

### `routers/lessons.py` — `_process_upload_lesson`

Add `source_language: str = "zh-CN"` as a new sixth positional parameter (after `deepgram_api_key`). This matches the positional `add_task(...)` call order above — `deepgram_api_key` must always be passed positionally in that call, never as a keyword argument, to avoid shifting `source_language` into the wrong slot. Pass it to `transcribe_audio_deepgram()`.

`_process_youtube_lesson` signature is unchanged — `source_language` comes from `request.source_language` which flows in via the existing `request` parameter.

### `routers/lessons.py` — `_process_youtube_lesson`

Pass `request.source_language` to `transcribe_audio_deepgram()`.

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

### `services/transcription.py` — space-stripping fix (two paths)

Deepgram inserts spaces between CJK tokens that must be stripped for Chinese, but must not be stripped for space-separated languages. Two functions are affected:

**`_segments_from_utterances(utterances: list[_DeepgramUtterance], language: str)`** — add `language` parameter (actual current signature has no `words_by_id`), apply strip conditionally:

```python
text = utt["transcript"]
if language.startswith("zh"):
    text = text.replace(" ", "")
```

**`_finalize_segment(words, index, language: str)`** — add `language` parameter. The current `"".join(...)` will concatenate non-CJK words without spaces. Fix by always joining with a space separator and then stripping spaces for CJK:

```python
text = " ".join(w["text"] for w in words)
if language.startswith("zh"):
    text = text.replace(" ", "")
```

**`_group_words_into_segments(words, language: str)`** — add `language` parameter, forwarded to `_finalize_segment`. Also fix the inline length measurement at line 130 (`current_text = "".join(...)`), which underestimates length for non-CJK by ignoring spaces. Apply the same conditional join:

```python
current_text = " ".join(w["text"] for w in current_words)
if language.startswith("zh"):
    current_text = current_text.replace(" ", "")
```

This keeps `_MAX_SEGMENT_CHARS = 40` semantically correct for both CJK (40 characters) and non-CJK (40 characters including spaces ≈ 6–7 words).

`transcribe_audio_deepgram()` passes `language` down through both paths.

---

## Tests

All three call sites in `backend/tests/test_transcription.py` are updated to pass an explicit `language="zh-CN"` argument:
- `test_transcribe_audio_deepgram_uses_utterances` (line 220)
- `test_transcribe_audio_deepgram_falls_back_to_words` (line 276)
- `test_transcribe_audio_deepgram_raises_on_api_error` (line 310)

Add a new test for non-CJK language behaviour to cover the conditional space-stripping branches. A test with `language="en"` and English word fixtures must assert that the resulting segment text has spaces preserved (e.g. `"Hello world."` not `"Helloworld."`), and that `_finalize_segment` and `_segments_from_utterances` do not strip spaces.

---

## Data Flow

```
CreateLesson (sourceLanguage state)
  → POST /api/lessons/generate        { source_language: "zh-CN" }
  → POST /api/lessons/generate-upload  form field source_language="zh-CN"
      → LessonRequest / form params
          → _process_youtube_lesson(request, ...)
              → transcribe_audio_deepgram(path, key, request.source_language)
          → _process_upload_lesson(..., source_language, ...)
              → transcribe_audio_deepgram(path, key, language)
                  → _segments_from_utterances(..., language)        # utterance path
                      → conditional space-strip for zh-* only
                  → _group_words_into_segments(words, language)     # fallback path
                      → _finalize_segment(words, i, language)
                          → space-join then conditional strip for zh-*
                  → Deepgram API params: { language: "zh-CN", model: "nova-2", ... }
```

---

## Out of Scope

- Auto language detection (Deepgram `detect_language`) — not trusted, excluded by design
- Separate source/translation language lists — unnecessary, same BCP-47 codes work for both
- Server-side allowlist validation of `source_language` — frontend constrains to known list; Deepgram errors surface clearly
- Persisted default for source language in `AppSettings` — no `translationLanguage`-style setting for source language; the in-component default of `"zh-CN"` is sufficient
