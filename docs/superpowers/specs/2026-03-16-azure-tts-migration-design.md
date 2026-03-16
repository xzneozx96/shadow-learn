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
                    │ factory validated at startup via lifespan event
        ┌───────────┴───────────┐
        ▼                       ▼
 MinimaxTTSProvider      AzureTTSProvider
 (existing logic)        (new, REST API)

GET /api/tts/provider → { "provider": "azure" | "minimax" }  (public, intentional)
POST /api/tts          → TTSRequest (keys for active provider)
                       ← MP3 bytes (unchanged)
```

The `/api/tts` response format and IndexedDB caching layer are unchanged. Only the keys sent in the request body differ per provider.

`GET /api/tts/provider` is intentionally public (no auth). The value (`"azure"` or `"minimax"`) is low-sensitivity operator config. CORS is already `allow_origins=["*"]` across all routes, consistent with the BYOK architecture.

## Backend

### New Files

**`backend/app/services/tts_provider.py`**
- Defines `TTSProvider` protocol: `async def synthesize(text: str, keys: "TTSKeys") -> bytes`
- Defines `TTSKeys` TypedDict:
  ```python
  class TTSKeys(TypedDict, total=False):
      minimax_api_key: str
      azure_speech_key: str
      azure_speech_region: str
  ```
- Both `TTSProvider` and `TTSKeys` are used consistently across all provider implementations and the factory.

**`backend/app/services/tts_azure.py`**
- `AzureTTSProvider` implementing `TTSProvider`
- Calls Azure Cognitive Services TTS REST API directly (no SDK):
  - Endpoint: `POST https://{region}.tts.speech.microsoft.com/cognitiveservices/v1`
  - Auth: `Ocp-Apim-Subscription-Key: {key}` header (no token exchange needed)
  - Content-Type: `application/ssml+xml`
  - Output format: `audio-16khz-128kbitrate-mono-mp3`
  - Voice: `zh-CN-XiaoxiaoNeural` (female, clear standard Mandarin)
  - **Timeout:** `httpx.AsyncClient(timeout=30.0)` — same as MiniMax precedent
  - **SSML generation:** text is XML-escaped (`html.escape(text)`) before interpolation to prevent injection via `<`, `>`, `&`, `"` characters. Example SSML:
    ```xml
    <speak version='1.0' xml:lang='zh-CN'>
      <voice xml:lang='zh-CN' name='zh-CN-XiaoxiaoNeural'>
        {escaped_text}
      </voice>
    </speak>
    ```
- **Text validation (before key validation):**
  1. Empty text → 400 "Text is required"
  2. Text > 2,000 characters → 400 "Text too long" (Azure TTS REST API supports up to ~3,000 SSML characters; 2,000 text chars gives safe headroom for SSML wrapper and XML escaping overhead. The MiniMax 10,000-char limit does NOT apply here.)

**`backend/app/services/tts_factory.py`**
- `get_tts_provider(settings) -> TTSProvider`
- Reads `settings.tts_provider`, returns `AzureTTSProvider` or `MinimaxTTSProvider`
- Raises `ValueError` on unknown provider value
- Called once in `main.py` during lifespan startup; result stored in `app.state.tts_provider`

### Modified Files

**`backend/app/services/tts.py`** → **`backend/app/services/tts_minimax.py`**
- Rename only; `synthesize_speech()` logic unchanged
- Wrapped in `MinimaxTTSProvider` class implementing `TTSProvider`

**`backend/app/config.py`**
- Adds: `tts_provider: str = "azure"` (env var: `SHADOWLEARN_TTS_PROVIDER`)

**`backend/app/models.py`**
- `TTSRequest` updated — `minimax_api_key` changes from required `str` to optional `str | None = None`:
  ```python
  class TTSRequest(BaseModel):
      text: str
      minimax_api_key: str | None = None
      azure_speech_key: str | None = None
      azure_speech_region: str | None = None
  ```

**`backend/app/main.py`**
- Replace `app = FastAPI(title="ShadowLearn API")` with lifespan pattern:
  ```python
  from contextlib import asynccontextmanager
  from app.services.tts_factory import get_tts_provider

  @asynccontextmanager
  async def lifespan(app: FastAPI):
      app.state.tts_provider = get_tts_provider(settings)  # ValueError → startup failure
      app.state.tts_provider_name = settings.tts_provider   # "azure" or "minimax"
      yield

  app = FastAPI(title="ShadowLearn API", lifespan=lifespan)
  ```

**`backend/app/routers/tts.py`**
- Adds `GET /api/tts/provider` → reads `request.app.state.tts_provider_name`, returns `{ "provider": "azure" | "minimax" }`
- `POST /api/tts` validation order:
  1. Text validation first (empty, too long) — returns 400 before checking keys
  2. Key validation for active provider — returns 400 if required keys missing
  3. Call `request.app.state.tts_provider.synthesize(text, keys)`

### Error Handling

Note: text validation happens before key validation. All unspecified Azure/MiniMax HTTP errors fall through to a generic 502.

| Condition | HTTP Status | Message |
|-----------|-------------|---------|
| Empty text | 400 | "Text is required" |
| Text > 2,000 chars | 400 | "Text too long" |
| Missing Azure keys | 400 | "Azure Speech key and region required" |
| Missing MiniMax key | 400 | "MiniMax API key required" |
| Azure 401 | 502 | "Azure Speech key invalid or expired" |
| Azure 403 | 502 | "Azure Speech quota exceeded or resource not found" |
| Azure 429 | 502 | "Azure Speech rate limit exceeded" |
| Azure 400 | 502 | "Azure TTS request error" |
| Azure 5xx / network error | 502 | "Azure TTS service unavailable" |
| MiniMax API error | 502 | "MiniMax TTS API error" (unchanged) |
| Unknown provider env value | startup error | app fails to boot |

## Frontend

### Modified Files

**`frontend/src/hooks/useTTS.ts`**
- Fetches `GET /api/tts/provider` once on mount, stores `provider` in state (initial value: `null`)
- **Provider loading state:** while `provider` is `null` (fetch in-flight), `playTTS` returns early silently — no toast, no error
- **Provider fetch failure:** if `GET /api/tts/provider` fails (network error or non-200), defaults to `"azure"` and logs a warning. No toast.
- Sends correct keys in `POST /api/tts` based on provider:
  - `azure`: sends `azure_speech_key` + `azure_speech_region`
  - `minimax`: sends `minimax_api_key`
- Error toast references the active provider: "Azure Speech key not configured" vs "MiniMax API key not configured"
- `playTTS` is wrapped in `useCallback` with `[db, keys, provider]` in the dependency array

**`frontend/src/components/onboarding/Setup.tsx`**
- Fetches provider on mount; `provider` initial state is `null`
- **Loading state (provider null):** show Azure key fields by default (safe fallback matching the default env), submit button disabled until provider resolves
- Shows Azure key fields (`azureSpeechKey`, `azureSpeechRegion`) if `provider === "azure"` — both required for form submission
- Shows MiniMax key field if `provider === "minimax"` — required for form submission
- Fields for the inactive provider are hidden (not just disabled)
- `handleSubmit` validation: validates active provider's fields as non-empty; inactive provider fields are ignored in validation but preserved in `DecryptedKeys` if already stored (so switching provider back doesn't lose saved keys)

**`frontend/src/components/settings/Settings.tsx`**
- Fetches provider on mount; `provider` initial state is `null`
- **Loading state (provider null):** show Azure fields by default (same safe fallback as Setup)
- Conditionally shows `editAzureSpeechKey` / `editAzureSpeechRegion` (if `azure`) or `editMinimaxKey` (if `minimax`)
- `handleSaveKeys` validation: requires the active provider's fields as non-empty
- **Inactive provider key on save:** the inactive provider's key field is kept in `DecryptedKeys` as-is (not cleared, not passed as empty string). This preserves keys when operator switches providers back.
- **Existing user edge case:** a user with `minimaxApiKey` stored but no Azure keys, with default provider `azure`, sees Azure fields empty and must enter their Azure key. No automatic migration.

### No Changes Needed

- `frontend/src/types.ts` — `DecryptedKeys` already has `azureSpeechKey`, `azureSpeechRegion`, `minimaxApiKey`
- `frontend/src/db/index.ts` — `tts-cache` keyed by text content, provider-agnostic
- `frontend/src/components/lesson/SegmentText.tsx` — calls `playTTS(text)`, unaware of provider
- `frontend/src/components/lesson/TranscriptPanel.tsx` — passes `playTTS` down, unaware of provider

### Data Flow (Azure active)

```
useTTS mounts
  → GET /api/tts/provider → { provider: "azure" }  (failure → default "azure")
  → provider stored in state
  → playTTS(text) called
    ├─ provider null → return early (no-op, no toast)
    ├─ azure_speech_key missing → toast "Azure Speech key not configured", return
    └─ keys present →
       check IndexedDB tts-cache for text
         ├─ HIT  → play cached Blob
         └─ MISS → POST /api/tts { text, azure_speech_key, azure_speech_region }
                     → router: text validation → key validation → synthesize
                     → AzureTTSProvider: XML-escape → SSML → Azure REST API → MP3 bytes
                   → store Blob in IndexedDB
                   → play audio
```

## Testing

### Backend

**`backend/tests/conftest.py`** (new or updated)
- Add shared fixture `tts_provider_app` that seeds `app.state.tts_provider` with an `AsyncMock` before each test, to avoid `AttributeError` from missing lifespan event in test context:
  ```python
  @pytest.fixture
  def mock_tts_provider(app):
      app.state.tts_provider = AsyncMock()
      return app.state.tts_provider
  ```
- All `test_tts_router.py` tests use `AsyncClient(transport=ASGITransport(app=app), base_url="http://test")` — the existing pattern works if `app.state.tts_provider` is pre-seeded via fixture

**`backend/tests/test_tts_minimax_service.py`** — renamed from `test_tts_service.py`
- All `patch("app.services.tts....")` strings updated to `patch("app.services.tts_minimax....")`
- Logic otherwise unchanged

**`backend/tests/test_tts_azure_service.py`** — new
- synthesize success (valid key + region + short text → MP3 bytes)
- 401 → raises mapped error
- 403 → raises mapped error
- 429 → raises mapped error
- 400 → raises mapped error
- 5xx → raises mapped error
- empty text → 400 before HTTP call
- text > 2,000 chars → 400 before HTTP call
- SSML injection: text with `<script>`, `&`, `"` is safely escaped in generated SSML

**`backend/tests/test_tts_router.py`** — updated
- Uses `mock_tts_provider` fixture (seeds `app.state.tts_provider`)
- Remove all `patch("app.routers.tts.synthesize_speech")` — replace with `mock_tts_provider.synthesize.return_value = b"mp3bytes"`
- Add: `GET /api/tts/provider` returns 200 with `{ "provider": ... }`
- Add: `POST /api/tts` with Azure keys when provider is Azure → calls `synthesize`
- Add: `POST /api/tts` with no Azure keys when provider is Azure → 400
- Add: `POST /api/tts` with MiniMax key when provider is MiniMax → calls `synthesize`
- Add: `POST /api/tts` with no MiniMax key when provider is MiniMax → 400
- Keep: empty text → 400 (text validation before key validation)
- Keep: text > 2,000 chars → 400

### Frontend

**`frontend/tests/useTTS.test.ts`** — updated
- Replace existing `'shows error toast when minimaxApiKey is missing'` test with two cases:
  - `'shows Azure error toast when azure_speech_key is missing and provider is azure'`
  - `'shows MiniMax error toast when minimaxApiKey is missing and provider is minimax'`
- Add: mock `GET /api/tts/provider` → `{ provider: "azure" }` in all existing tests
- Add: `playTTS` is a no-op while `provider` is null (fetch not yet resolved)
- Add: provider fetch failure → defaults to `"azure"`, no toast

## Migration Notes

- No data migration required.
- **Cache consistency trade-off (accepted):** `tts-cache` IndexedDB entries are keyed by text only. If operator switches providers, cached audio from the previous provider will be served for cache hits. Accepted — audio is still correct speech for the text, just a different voice. Users get fresh audio on cache miss or after clearing site data.
- Default provider is `azure`. No env var change needed for new deployments.
- Existing users with `minimaxApiKey` stored can still use MiniMax if operator sets `SHADOWLEARN_TTS_PROVIDER=minimax`.
- Azure voice: `zh-CN-XiaoxiaoNeural` (female, standard Mandarin). Can be changed in `tts_azure.py` without other code changes.
- **Character limit change:** Azure limit is 2,000 text chars (down from MiniMax's 10,000). This is sufficient for any single word or sentence in a language learning context.
