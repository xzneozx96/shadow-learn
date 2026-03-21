# Free Trial Mode — Design Spec

**Date:** 2026-03-21
**Status:** Approved

## Overview

Allow users to try ShadowLearn without providing their own API keys. The backend serves as a fallback key provider. When a user is ready, they can add their own keys at any time — their trial lessons are preserved.

## Approach

**Option A — "Empty keys = use backend fallback"**

Every router already receives API keys from the request body. When a request key is empty/absent, the backend falls back to its own env-configured keys. The frontend sends empty strings in trial mode. No new protocol needed.

---

## Backend Changes

### `config.py`

Add 5 optional fallback key fields (all `str | None = None`):

```python
openrouter_api_key: str | None = None       # SHADOWLEARN_OPENROUTER_API_KEY
deepgram_api_key: str | None = None          # SHADOWLEARN_DEEPGRAM_API_KEY
azure_speech_key: str | None = None          # SHADOWLEARN_AZURE_SPEECH_KEY
azure_speech_region: str | None = None       # SHADOWLEARN_AZURE_SPEECH_REGION
minimax_api_key: str | None = None           # SHADOWLEARN_MINIMAX_API_KEY
```

### `models.py`

Relax all API key fields from `str` to `str | None = None`:
- `LessonRequest.openrouter_api_key`
- `LessonRequest.deepgram_api_key`
- `LessonRequest.azure_speech_key`
- `LessonRequest.azure_speech_region`
- `ChatRequest.openrouter_api_key`
- `TTSRequest` fields (already optional)
- Pronunciation FormData fields

### Routers (lessons, chat, tts, pronunciation, agent, quiz, translation_exercise)

Add a shared helper (e.g. in a new `backend/app/routers/_utils.py`):

```python
def _resolve_key(request_key: str | None, fallback: str | None, name: str) -> str:
    key = request_key or fallback
    if not key:
        raise HTTPException(400, detail=f"No {name} provided and no server fallback configured")
    return key
```

Each router calls this to resolve the effective key before use.

**Special case — `tts.py`:** The existing inline key-validation block (e.g. `if not body.azure_speech_key: raise HTTPException(...)`) must be replaced by `_resolve_key` calls against the backend fallback *before* the validation check fires. The structure becomes: resolve effective key via `_resolve_key(body.azure_speech_key, settings.azure_speech_key, "Azure Speech key")`, then proceed with the resolved value.

### `/api/config` response

Add field:

```python
free_trial_available: bool
```

`True` when ALL keys required for a baseline trial experience are set: `openrouter_api_key`, plus the active TTS provider key(s) (`azure_speech_key` + `azure_speech_region` for Azure, `minimax_api_key` for MiniMax), plus the active STT provider key (`deepgram_api_key` for Deepgram, or Azure keys for Azure STT). If any required key is missing, `free_trial_available` is `False` and the "Try for free" button is hidden — users must provide their own keys.

Frontend uses this to conditionally show the "Try for free" button.

---

## Frontend Changes

### `types.ts`

No changes to `DecryptedKeys` — it remains the same interface for own-key users.

### `AuthContext`

Add to `AuthState`:

```typescript
trialMode: boolean
startTrial: () => void
```

**`startTrial()`** implementation:
- Sets `isUnlocked = true`
- Sets `trialMode = true`
- Keeps `keys = null`
- Writes `'trial'` to `sessionStorage` under a `shadowlearn_trial` key

**Trial mode persistence:** `sessionStorage` — survives re-renders/hot reload, cleared when tab closes. Trial users must tap "Try for free" again on a new session. This is intentional: no sensitive state persists, and it gently nudges users toward their own keys.

**Initialization timing:** `AuthProvider` initialises `trialMode` *synchronously* from `sessionStorage` at the start of its own `useState` initialiser — before the async `initDB()` call settles. This ensures `trialMode = true` is already in state when `AuthGate` first renders, preventing the Setup screen from flickering for a live trial session.

**`AuthGate` logic:**

| State | Screen shown |
|---|---|
| Loading | Spinner |
| `isFirstSetup && !trialMode` | `Setup` component |
| `!isUnlocked && !trialMode` | `Unlock` component |
| `isUnlocked \|\| trialMode` | App |

**`isFirstSetup` detection:** unchanged — still checks if the `crypto` IndexedDB store has data. Trial mode bypasses this gate via the `trialMode` flag.

**Key consumers:** All hooks (`useAgentChat`, `useTTS`, `usePronunciationAssessment`, `CreateLesson`) already use `keys?.someKey ?? ''`. In trial mode `keys === null`, so they naturally send empty strings — backend resolves to fallback. The agent tools layer (`agent-tools.ts`) also sends `openrouter_api_key` to `/api/agent`, `/api/quiz`, and `/api/translation-exercise` — these all benefit from the same empty-string fallback without any frontend changes.

### `Setup.tsx`

Two paths presented to the user:

**"Try for free" button** (rendered only when `appConfig.free_trial_available === true`):
- Prominent, clearly secondary to the own-keys form
- Disclaimer beneath: *"Free trial uses shared API keys. This may be discontinued when costs become unsustainable — add your own keys in Settings anytime."*
- On click: calls `startTrial()` → navigates into app

**Own-keys form (existing flow):**
- Key fields remain but validation relaxes: OpenRouter key is required only if the user is on the own-keys path (i.e. they're filling out the form at all)
- PIN setup unchanged
- On submit: calls existing `setup(keys, pin)`

### `Settings.tsx`

When `trialMode === true`, render a dismissible info banner at the top of the page:

> *"You're using the free trial. Add your own API keys below to switch — your lessons will be preserved."*

Banner disappears once the user saves their own keys. **`setup()` is responsible for clearing trial mode atomically** — it calls `setTrialMode(false)` and `sessionStorage.removeItem('shadowlearn_trial')` in the same synchronous batch as `setIsUnlocked(true)` and `setIsFirstSetup(false)`. This prevents any intermediate render where `isFirstSetup = false` but `trialMode` is still `true`.

No other structural changes to Settings.

---

## Data Preservation

Trial lessons are **not lost** when a user later sets up their own keys. Lesson data lives in separate IndexedDB stores (`lessons`, `segments`, `vocabulary`, etc.) that are never touched by the `crypto` store setup. Setting up own keys only creates/updates the `crypto` store.

---

## Error Handling

- If `free_trial_available === false` (backend has no fallback keys), the "Try for free" button is hidden entirely. Users must provide their own keys.
- If a trial user hits an endpoint and the backend fallback key is missing (misconfiguration), they receive a `400` error with a clear message.
- No silent failures — every key resolution either succeeds or throws an explicit HTTP error.

---

## Out of Scope

- Rate limiting / quota tracking for trial users (future concern)
- Trial expiry / forced upgrade flow (handled socially via the disclaimer, not technically)
- Backend key rotation UI
- **Backend key scraping protection** — a determined user can observe that empty-string requests succeed and call the backend directly without going through the app. Accepted risk for MVP; rate limiting or API authentication should be added as a follow-up if abuse becomes a concern.
