# Azure STT Migration Design

**Date:** 2026-03-18
**Status:** Approved

## Overview

Add Azure AI Speech as an alternative transcription (STT) provider alongside Deepgram. The active provider is selected by a backend environment variable (`SHADOWLEARN_STT_PROVIDER`). The frontend queries a new `/api/config` endpoint to determine which provider is active and sends only the relevant API keys in lesson requests.

This follows the existing TTS provider pattern (`tts_provider.py` / `tts_azure.py` / `tts_minimax.py` / `tts_factory.py`) exactly, with one adaptation: since transcription runs inside background tasks (not route handlers), the resolved `STTProvider` instance is passed as a parameter to background task functions rather than accessed via `app.state` at call time.

---

## Backend

### New Files

#### `backend/app/services/transcription_provider.py`
Protocol, shared key types, and all shared internal types/helpers — so both provider implementations can import from here.

Defines:
- `_Word`, `_WordTiming`, `_Segment` TypedDicts
- `_finalize_segment()` and `_group_words_into_segments()` helpers (moved from `transcription.py`)
- `TranscriptionKeys` TypedDict
- `STTProvider` Protocol

```python
class TranscriptionKeys(TypedDict, total=False):
    deepgram_api_key: str
    azure_speech_key: str
    azure_speech_region: str

class STTProvider(Protocol):
    async def transcribe(
        self, audio_path: Path, keys: TranscriptionKeys, language: str
    ) -> list[_Segment]: ...
```

`total=False` is intentional: `lessons.py` only populates keys that are present in the request (absent keys are genuinely absent). Each provider's `transcribe()` checks for its required key at runtime and raises `ValueError` if missing. This trades static-type guarantees for a clean provider interface — consistent with how `TTSKeys` works in the existing TTS pattern.

#### `backend/app/services/transcription_deepgram.py`
All existing Deepgram logic from `transcription.py` moved here. Shared types/helpers are imported from `transcription_provider.py` instead of defined locally. Exposes a `DeepgramSTTProvider` class implementing `STTProvider`.

#### `backend/app/services/transcription_azure.py`
`AzureSTTProvider` implementing `STTProvider` via Azure Speech SDK continuous recognition. Imports shared types from `transcription_provider.py`.

**Audio format note:** `audio.py`'s `extract_audio_from_upload()` produces MP3 (`libmp3lame`, 192k). Azure's `AudioConfig(filename=...)` expects WAV by default. `_run_continuous_recognition()` must therefore convert the input MP3 to WAV 16kHz mono via a temp file before passing it to the SDK — consistent with how `pronunciation.py` converts webm → wav using `ffmpeg` subprocess.

- `transcribe()` validates `azure_speech_key` and `azure_speech_region` are present in `keys`, then delegates to `asyncio.to_thread(_run_continuous_recognition, ...)`
- `_run_continuous_recognition()` (blocking):
  1. Converts input audio to WAV 16kHz mono via `ffmpeg` subprocess into a `tempfile.TemporaryDirectory`
  2. Creates `SpeechConfig(subscription=key, region=region)` with `output_format = OutputFormat.Detailed` for word-level timestamps
  3. Creates `AudioConfig(filename=str(wav_path))`
  4. Uses `SpeechRecognizer` with `recognized`, `session_stopped`, and `canceled` event callbacks; uses `threading.Event` to block until session ends
  5. Each `recognized` event: parses `result.json` (a JSON string on the result object) to get `NBest[0].Words` — each word has `Word` (string), `Offset` (int, 100ns ticks), `Duration` (int, 100ns ticks). Convert to seconds by dividing by `10_000_000`.
  6. Converts collected utterances to `list[_Segment]` using the shared `_finalize_segment` helper and Chinese space-stripping logic from `transcription_provider.py`
  7. On `canceled` event where `result.cancellation_details.reason == CancellationReason.Error`, raises `RuntimeError` with `cancellation_details.error_details`

#### `backend/app/services/transcription_factory.py`
```python
def get_stt_provider(settings: Settings) -> STTProvider:
    provider = settings.stt_provider.lower()
    if provider == "deepgram":
        from app.services.transcription_deepgram import DeepgramSTTProvider
        return DeepgramSTTProvider()
    if provider == "azure":
        from app.services.transcription_azure import AzureSTTProvider
        return AzureSTTProvider()
    raise ValueError(
        f"Unknown STT provider: '{settings.stt_provider}'. "
        "Set SHADOWLEARN_STT_PROVIDER to 'deepgram' or 'azure'."
    )
```

### Deleted Files

- `backend/app/services/transcription.py` — replaced by `transcription_provider.py` + `transcription_deepgram.py`

### Modified Files

#### `backend/app/config.py`
Add one field:
```python
stt_provider: str = "deepgram"  # env: SHADOWLEARN_STT_PROVIDER; values: deepgram | azure
```

#### `backend/app/models.py`
Add two optional fields to `LessonRequest`:
```python
azure_speech_key: str | None = None
azure_speech_region: str | None = None
```
`deepgram_api_key` remains (used when `stt_provider=deepgram`).

#### `backend/app/main.py`
Wire STT provider in lifespan alongside TTS, and register new config router:
```python
from app.services.transcription_factory import get_stt_provider
from app.routers import chat, config, jobs, lessons, pronunciation, quiz, tts

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.tts_provider = get_tts_provider(settings)
    app.state.tts_provider_name = settings.tts_provider
    app.state.stt_provider = get_stt_provider(settings)
    app.state.stt_provider_name = settings.stt_provider
    yield

# ...
app.include_router(config.router)
```

#### `backend/app/routers/lessons.py`

**Passing the provider into background tasks:**
Background task functions are plain async functions with no access to `app.state`. The resolved `STTProvider` instance is retrieved from `Request` in the route handler and passed directly as a parameter.

```python
@router.post("/generate")
async def generate_lesson(request: LessonRequest, background_tasks: BackgroundTasks, req: Request) -> dict:
    stt_provider = req.app.state.stt_provider
    # ...
    background_tasks.add_task(_process_youtube_lesson, request, video_id, job_id, stt_provider)

@router.post("/generate-upload")
async def generate_lesson_upload(
    background_tasks: BackgroundTasks,
    req: Request,
    file: UploadFile,
    translation_languages: str = Form(...),
    openrouter_api_key: str = Form(...),
    deepgram_api_key: str | None = Form(None),
    azure_speech_key: str | None = Form(None),     # new
    azure_speech_region: str | None = Form(None),  # new
    source_language: str = Form("zh-CN"),
) -> dict:
    stt_provider = req.app.state.stt_provider
    # ...
    background_tasks.add_task(
        _process_upload_lesson,
        file, translation_languages, openrouter_api_key, job_id,
        deepgram_api_key, azure_speech_key, azure_speech_region,
        source_language, stt_provider,
    )
```

**`_process_youtube_lesson`** updated signature:
```python
async def _process_youtube_lesson(
    request: LessonRequest,
    video_id: str,
    job_id: str,
    stt_provider: STTProvider,   # new
) -> None:
```
Transcription call:
```python
keys: TranscriptionKeys = {}
if request.deepgram_api_key:
    keys["deepgram_api_key"] = request.deepgram_api_key
if request.azure_speech_key:
    keys["azure_speech_key"] = request.azure_speech_key
if request.azure_speech_region:
    keys["azure_speech_region"] = request.azure_speech_region
segments = await stt_provider.transcribe(audio_path, keys, request.source_language)
```

**`_process_upload_lesson`** updated signature:
```python
async def _process_upload_lesson(
    file: UploadFile,
    translation_languages: list[str],
    openrouter_api_key: str,
    job_id: str,
    deepgram_api_key: str | None,
    azure_speech_key: str | None,     # new
    azure_speech_region: str | None,  # new
    source_language: str,
    stt_provider: STTProvider,        # new
) -> None:
```
Same key construction pattern as above using the individual parameters.

**Key validation** happens inside each provider's `transcribe()`: if the required key is absent, raise `ValueError` (e.g. `"Azure Speech key is required when stt_provider=azure"`).

### New File: `backend/app/routers/config.py`

```python
from fastapi import APIRouter, Request

router = APIRouter(prefix="/api")

@router.get("/config")
async def get_config(request: Request) -> dict:
    """Return active provider names for both STT and TTS."""
    return {
        "stt_provider": request.app.state.stt_provider_name,
        "tts_provider": request.app.state.tts_provider_name,
    }
```

`/api/tts/provider` is **kept as-is** for backward compatibility — it continues to return `{ "provider": "..." }` unchanged. The three frontend callers are migrated to `/api/config` (see Frontend section) to consolidate provider discovery into a single endpoint. The old endpoint becomes a legacy alias but is not removed.

---

## Frontend

### `/api/tts/provider` → `/api/config` Migration

Three files currently call `fetch('/api/tts/provider')` and read `response.provider`. Each is updated to call `fetch('/api/config')` and read `response.tts_provider` instead. This was explicitly requested to consolidate both provider lookups into one endpoint.

- `frontend/src/components/settings/Settings.tsx`
- `frontend/src/components/onboarding/Setup.tsx`
- `frontend/src/hooks/useTTS.ts`

### STT Key Selection in Lesson Requests

**Only `CreateLesson.tsx` requires changes** — it is the sole file that constructs the lesson request body and formData (including `deepgram_api_key`). `UploadTab.tsx` does not contain STT key logic.

`CreateLesson.tsx` fetches `/api/config` **once at mount** and stores `sttProvider` in component state (same pattern as `Settings.tsx` fetching the TTS provider at mount). On lesson submission, it includes only the relevant keys:

- `sttProvider === "deepgram"` → include `deepgram_api_key` only (from `keys.deepgramApiKey`)
- `sttProvider === "azure"` → include `azure_speech_key` + `azure_speech_region` only (from `keys.azureSpeechKey` / `keys.azureSpeechRegion`)

`DecryptedKeys` (defined in `frontend/src/types.ts`) already includes `azureSpeechKey?: string` and `azureSpeechRegion?: string` — no new key collection UI needed.

### Key Validation / UI

`Settings.tsx` and `Setup.tsx` gate the Deepgram API key field on `sttProvider === "deepgram"`. When Azure is the STT provider, the Deepgram key field is not shown and not required for lesson creation.

Azure Speech key and region fields continue to be collected unconditionally (needed for TTS and pronunciation regardless of STT provider).

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Active provider key missing in request | `ValueError` raised inside provider's `transcribe()`: e.g. `"Azure Speech key is required when stt_provider=azure"` |
| Azure `canceled` with `CancellationReason.Error` | `RuntimeError` raised with `cancellation_details.error_details` |
| Azure returns empty utterances | Return `[]`, log warning (same as Deepgram empty result) |
| ffmpeg WAV conversion fails in Azure provider | `RuntimeError` propagated from subprocess — caught by pipeline error handler |
| Unknown `SHADOWLEARN_STT_PROVIDER` value | `ValueError` at startup from factory — app fails to start with a clear message |

---

## Testing

**Backend:**
- Unit tests for `transcription_deepgram.py` — move/rename existing `test_transcription.py` tests; update imports to new module
- Unit tests for `transcription_azure.py` — mock `azure.cognitiveservices.speech` SDK and `subprocess.run` (ffmpeg); verify utterance → segment conversion, 100ns tick → seconds math (`offset / 10_000_000`), and `RuntimeError` on `CancellationReason.Error`
- Unit test for `transcription_factory.py` — correct class returned per provider value, `ValueError` on unknown
- Unit test for `GET /api/config` — returns both `stt_provider_name` and `tts_provider_name` from `app.state`
- Integration: existing lesson pipeline tests updated to pass a mock `STTProvider` instance directly to `_process_youtube_lesson` and `_process_upload_lesson` (instead of mocking `transcribe_audio_deepgram`)

**Frontend:**
- Unit test for the STT key selection logic in `CreateLesson.tsx` — mock `/api/config` returning `"deepgram"` and `"azure"` respectively; verify that only the correct keys are included in the submitted form data
