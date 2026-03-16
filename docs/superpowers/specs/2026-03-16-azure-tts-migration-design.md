# Azure TTS Migration Design

**Date:** 2026-03-16
**Status:** Approved
**Replaces:** `docs/superpowers/specs/2026-03-15-minimax-tts-design.md`

## Problem

MiniMax TTS requires purchasing credits upfront with no pay-as-you-go option. This creates friction for new users who must commit financially before evaluating the app. Azure Cognitive Services TTS offers:

- 500K characters/month free tier (resets monthly)
- ~$4/1M characters PAYG after free tier
- Excellent Mandarin Chinese neural voices
- Same API key already used for pronunciation assessment (`azureSpeechKey` + `azureSpeechRegion`)

## Goal

Replace MiniMax TTS with Azure TTS as the default provider while keeping MiniMax available. Provider selection is controlled via a backend environment variable, allowing the operator to swap between providers without code changes.

## Architecture

```
SHADOWLEARN_TTS_PROVIDER=azure|minimax (env var, default: azure)
                    │
          ┌─────────▼──────────┐
          │   TTSProvider      │  ← abstract protocol
          │   (interface)      │
          └─────────┬──────────┘
                    │ factory resolves at startup
        ┌───────────┴───────────┐
        ▼                       ▼
 MinimaxTTSProvider      AzureTTSProvider
 (existing logic)        (new, REST API)

GET /api/tts/provider → { "provider": "azure" | "minimax" }
POST /api/tts          → TTSRequest (keys for active provider)
                       ← MP3 bytes (unchanged)
```

The `/api/tts` response format and IndexedDB caching layer are unchanged. Only the keys sent in the request body differ per provider.

## Backend

### New Files

**`backend/app/services/tts_provider.py`**
- Defines `TTSProvider` protocol: `async def synthesize(text: str, keys: dict) -> bytes`
- Defines `TTSKeys` typed dict with all possible key fields across providers

**`backend/app/services/tts_azure.py`**
- `AzureTTSProvider` implementing `TTSProvider`
- Calls Azure Cognitive Services TTS REST API directly (no SDK):
  - Endpoint: `POST https://{region}.tts.speech.microsoft.com/cognitiveservices/v1`
  - Auth: `Ocp-Apim-Subscription-Key: {key}` header (no token exchange needed)
  - Content-Type: `application/ssml+xml`
  - Output format: `audio-16khz-128kbitrate-mono-mp3`
  - Voice: `zh-CN-XiaoxiaoNeural` (female, clear standard Mandarin)
  - SSML body wraps text in `<speak>/<voice>` tags
- Text validation: rejects empty text and text exceeding 10,000 characters (matching MiniMax limit)

**`backend/app/services/tts_factory.py`**
- `get_tts_provider(settings) -> TTSProvider`
- Reads `settings.tts_provider`, returns `AzureTTSProvider` or `MinimaxTTSProvider`
- Raises `ValueError` on unknown provider value (caught at startup)

### Modified Files

**`backend/app/services/tts.py`** → **`backend/app/services/tts_minimax.py`**
- Rename only; `synthesize_speech()` logic unchanged
- Wrapped in `MinimaxTTSProvider` class implementing `TTSProvider`

**`backend/app/config.py`**
- Adds: `tts_provider: str = "azure"` (env var: `SHADOWLEARN_TTS_PROVIDER`)

**`backend/app/models.py`**
- `TTSRequest` updated:
  ```python
  class TTSRequest(BaseModel):
      text: str
      minimax_api_key: str | None = None
      azure_speech_key: str | None = None
      azure_speech_region: str | None = None
  ```

**`backend/app/routers/tts.py`**
- Adds `GET /api/tts/provider` → `{ "provider": "azure" | "minimax" }`
- `POST /api/tts` uses `tts_factory.get_tts_provider(settings)` to resolve provider
- Validates that the required keys for the active provider are present in the request; returns 400 if missing

### Error Handling

| Condition | HTTP Status | Message |
|-----------|-------------|---------|
| Azure 401 | 502 | "Azure Speech key invalid or expired" |
| Azure 400 | 400 | "Invalid text for Azure TTS" |
| MiniMax API error | 502 | "MiniMax TTS API error" (unchanged) |
| Missing Azure keys | 400 | "Azure Speech key and region required" |
| Missing MiniMax key | 400 | "MiniMax API key required" |
| Unknown provider env value | startup error | app fails to boot |
| Empty text | 400 | "Text is required" |
| Text > 10,000 chars | 400 | "Text too long" |

## Frontend

### Modified Files

**`frontend/src/hooks/useTTS.ts`**
- Fetches `GET /api/tts/provider` once on mount, stores `provider` in state
- Sends correct keys in `POST /api/tts` based on provider:
  - `azure`: sends `azure_speech_key` + `azure_speech_region`
  - `minimax`: sends `minimax_api_key`
- Error toast references the active provider: "Azure Speech key not configured" vs "MiniMax API key not configured"

**`frontend/src/components/onboarding/Setup.tsx`**
- Fetches provider on mount
- Shows Azure key fields if provider is `azure` (required)
- Shows MiniMax key field if provider is `minimax` (required)
- Fields for the inactive provider are hidden (not just disabled)

**`frontend/src/components/settings/Settings.tsx`**
- Same conditional field logic as Setup

### No Changes Needed

- `frontend/src/types.ts` — `DecryptedKeys` already has `azureSpeechKey`, `azureSpeechRegion`, `minimaxApiKey`
- `frontend/src/db/index.ts` — `tts-cache` keyed by text content, provider-agnostic
- `frontend/src/components/lesson/SegmentText.tsx` — calls `playTTS(text)`, unaware of provider
- `frontend/src/components/lesson/TranscriptPanel.tsx` — passes `playTTS` down, unaware of provider

### Data Flow (Azure active)

```
useTTS mounts
  → GET /api/tts/provider → { provider: "azure" }
  → playTTS(text) called
  → check IndexedDB tts-cache for text
    ├─ HIT  → play cached Blob
    └─ MISS → POST /api/tts { text, azure_speech_key, azure_speech_region }
                → AzureTTSProvider.synthesize()
                → Azure REST API → MP3 bytes
              → store Blob in IndexedDB
              → play audio
```

## Testing

**Backend:**
- `backend/tests/test_tts_azure_service.py` — synthesize success, 401, 400, empty text, text too long
- `backend/tests/test_tts_router.py` — updated: provider discovery endpoint, Azure routing, MiniMax routing, missing key validation per provider

**Frontend:**
- `frontend/tests/useTTS.test.ts` — updated: mocks `/api/tts/provider`, tests Azure key path, MiniMax key path, missing key toast per provider

## Migration Notes

- No data migration required. Existing `tts-cache` IndexedDB entries remain valid (keyed by text, not provider). Users get cache misses on first play after provider switch, then hits thereafter.
- Default provider is `azure`. No env var change needed for new deployments.
- Existing users with `minimaxApiKey` stored can still use MiniMax if operator sets `SHADOWLEARN_TTS_PROVIDER=minimax`.
- Azure voice: `zh-CN-XiaoxiaoNeural` (female). Can be changed via env var or future config without code changes if needed.
