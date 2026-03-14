# Minimax TTS Integration Design

## Overview

Add text-to-speech pronunciation playback to ShadowLearn using Minimax API (`speech-2.6-turbo` model). Users can hear individual words (from the tooltip) and full sentences (from the transcript panel). Audio is cached persistently in IndexedDB keyed by text so repeated words across lessons don't re-call the API.

## Architecture

```
WordTooltip / TranscriptPanel
        │ playTTS(text)
        ▼
    useTTS hook
        │
        ├─ cache hit? → IndexedDB "tts-cache" store → play via Audio API
        │
        └─ cache miss? → POST /api/tts { text, minimax_api_key }
                              │
                              ▼
                    backend/app/routers/tts.py
                              │
                              ▼
                    backend/app/services/tts.py
                              │ httpx POST to Minimax API
                              ▼
                        JSON response with base64 audio
                              │ decode base64 → MP3 bytes
                              ▼
                    Response(audio/mpeg) → frontend
                              │
                    store in IndexedDB → play via Audio API
```

## Backend

### Config: `backend/app/config.py`

Add `minimax_tts_url` to `Settings` class (consistent with existing `openai_chat_url` pattern):

```python
minimax_tts_url: str = "https://api.minimaxi.com/v1/t2a_v2"
```

### New service: `backend/app/services/tts.py`

- `async def synthesize_speech(text: str, api_key: str) -> bytes`
- Calls `settings.minimax_tts_url` with model `speech-2.6-turbo`
- JSON body:
  ```json
  {
    "model": "speech-2.6-turbo",
    "text": "<text>",
    "voice_setting": {
      "voice_id": "Chinese_Female_1"
    },
    "audio_setting": {
      "format": "mp3",
      "sample_rate": 32000
    }
  }
  ```
- Authorization header: `Bearer {api_key}`
- Response is JSON with a base64-encoded `audio_file` field. The service parses the JSON, decodes the base64 audio, and returns raw MP3 bytes.
- Voice selection: hardcoded to `Chinese_Female_1` for now. Voice selection UI is a future enhancement.
- Text length: validates `len(text) <= 10_000` (Minimax limit), raises `ValueError` otherwise.

### New router: `backend/app/routers/tts.py`

- `POST /api/tts`
- Request body: `{ "text": str, "minimax_api_key": str }`
- Validates text is non-empty
- Calls `synthesize_speech`, returns `Response(content=audio_bytes, media_type="audio/mpeg")`

### Registration

- Mount router in the FastAPI app alongside existing routers

## Frontend

### Key management changes

**`types.ts`** — extend `DecryptedKeys`:
```ts
export interface DecryptedKeys {
  openaiApiKey: string
  minimaxApiKey?: string
}
```

The field is optional so existing encrypted blobs (which lack this field) decrypt without error. The `useTTS` hook checks for its presence before calling.

**`Setup.tsx`** — add a Minimax API key input field alongside the OpenAI one. The field is optional during setup (TTS is not required for core functionality).

**`Settings.tsx`** — show the Minimax key in the API Keys card, same masked/visible toggle pattern as OpenAI. To update a key, the user edits the value inline and clicks a "Save Keys" button which re-encrypts all keys. No PIN re-entry needed since the decrypted keys are already in memory.

### IndexedDB changes

**`db/index.ts`**:
- Bump `DB_VERSION` from 1 → 2
- Add `tts-cache` object store in the `upgrade` handler using `if (oldVersion < 2)` guard (proper versioned migration)
- New functions:
  - `getTTSCache(db, text: string): Promise<Blob | undefined>`
  - `saveTTSCache(db, text: string, blob: Blob): Promise<void>`
- No cache eviction strategy for now. Each audio clip is ~50-200KB, so thousands of words would still be under 100MB. Revisit if this becomes an issue.

### New hook: `frontend/src/hooks/useTTS.ts`

```ts
interface UseTTSReturn {
  playTTS: (text: string) => Promise<void>
  loadingText: string | null
}
```

- Receives `db` and `keys` as parameters from the parent component (consistent with `useChat` pattern — hooks receive dependencies rather than calling `useAuth()` internally)
- `playTTS(text)`:
  1. If `text` is empty, no-op
  2. If `minimaxApiKey` is not set, toast error directing user to Settings
  3. If audio is already playing, stop it
  4. Set `loadingText = text`
  5. Check IndexedDB `tts-cache` for `text`
  6. If cache hit, create `Audio` from blob URL and play
  7. If cache miss, `POST /api/tts` with `{ text, minimax_api_key }`, store response blob in IndexedDB, then play
  8. On error, toast the error message
  9. Clear `loadingText` once playback starts (or on error)
- `loadingText`: the text string currently being fetched, or `null` — used by UI to show spinner on the correct button

### UI changes

**`TranscriptPanel.tsx`**:
- Instantiates `useTTS()` hook (passing `db` and `keys`)
- Passes `playTTS` and `loadingText` as props to `WordTooltip`
- Adds a `Volume2` icon button on each segment row (near pinyin or right edge)
- While `loadingText === segment.chinese`, shows `Loader2` with `animate-spin`

**`WordTooltip.tsx`**:
- Receives `playTTS` and `loadingText` as new props
- Adds a `Volume2` icon button next to the existing copy button (top-right corner of tooltip)
- While `loadingText === word.word`, shows `Loader2` with `animate-spin`

## Error handling

| Scenario | Behavior |
|---|---|
| No Minimax API key | Toast: "Add your Minimax API key in Settings to use pronunciation" |
| API call fails | Toast with error message, button returns to idle |
| Concurrent clicks | Stop current audio, start new playback |
| Empty text | No-op |
| Text > 10,000 chars | Backend returns 400 error |

## Testing

- Backend: unit test for `tts.py` service (mock httpx)
- Backend: endpoint test for `/api/tts` router
- Frontend: unit test for `useTTS` hook (mock fetch + IndexedDB)
