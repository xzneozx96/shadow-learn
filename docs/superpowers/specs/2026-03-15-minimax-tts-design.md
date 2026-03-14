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
                        MP3 audio bytes
                              │
                              ▼
                    Response(audio/mpeg) → frontend
                              │
                    store in IndexedDB → play via Audio API
```

## Backend

### New service: `backend/app/services/tts.py`

- `async def synthesize_speech(text: str, api_key: str) -> bytes`
- Calls `https://api.minimax.chat/v1/t2a_v2` with model `speech-2.6-turbo`
- JSON body: `{ "model": "speech-2.6-turbo", "text": text }`
- Authorization header: `Bearer {api_key}`
- Returns raw MP3 audio bytes from the response

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

**`Setup.tsx`** — add a Minimax API key input field alongside the OpenAI one.

**`Settings.tsx`** — show the Minimax key in the API Keys card, same masked/visible toggle pattern as OpenAI. Allow updating it (re-encrypt all keys with existing PIN).

### IndexedDB changes

**`db/index.ts`**:
- Bump `DB_VERSION` from 1 → 2
- Add `tts-cache` object store in the `upgrade` handler
- New functions:
  - `getTTSCache(db, text: string): Promise<Blob | undefined>`
  - `saveTTSCache(db, text: string, blob: Blob): Promise<void>`

### New hook: `frontend/src/hooks/useTTS.ts`

```ts
interface UseTTSReturn {
  playTTS: (text: string) => void
  loadingText: string | null
}
```

- Gets `db` and `keys` from `useAuth()`
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
- Instantiates `useTTS()` hook
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

## Testing

- Backend: unit test for `tts.py` service (mock httpx)
- Backend: endpoint test for `/api/tts` router
- Frontend: unit test for `useTTS` hook (mock fetch + IndexedDB)
