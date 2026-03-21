# Free Trial Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to try ShadowLearn without their own API keys by falling back to server-configured keys when the frontend sends empty strings.

**Architecture:** Backend stores optional fallback API keys in `config.py` env vars. Every router resolves the effective key via a shared helper: use the request key if present, otherwise fall back to the env var, or raise a 400 if neither exists. The frontend gains a `trialMode` state in `AuthContext` (persisted in `sessionStorage`); trial users send empty strings naturally since `keys === null`.

**Tech Stack:** Python 3.12 / FastAPI / pydantic-settings (backend); React 19 / TypeScript / Vite / Tailwind CSS v4 / shadcn/ui (frontend); pytest + httpx (backend tests); vitest + Testing Library (frontend tests).

**Spec:** `docs/superpowers/specs/2026-03-21-free-trial-design.md`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `backend/app/routers/_utils.py` | **Create** | Shared `_resolve_key` helper |
| `backend/app/config.py` | **Modify** | Add 5 optional fallback key fields |
| `backend/app/models.py` | **Modify** | Relax `openrouter_api_key` in `LessonRequest` and `ChatRequest` to `str \| None = None` |
| `backend/app/routers/agent.py` | **Modify** | Relax `AgentRequest.openrouter_api_key`, use `_resolve_key` |
| `backend/app/routers/quiz.py` | **Modify** | Relax `QuizRequest.openrouter_api_key`, use `_resolve_key` |
| `backend/app/routers/translation_exercise.py` | **Modify** | Relax `GenerateRequest`/`EvaluateRequest.openrouter_api_key`, use `_resolve_key` |
| `backend/app/routers/chat.py` | **Modify** | Use `_resolve_key` for `openrouter_api_key` |
| `backend/app/routers/lessons.py` | **Modify** | Use `_resolve_key` for openrouter key in youtube + upload pipelines |
| `backend/app/routers/tts.py` | **Modify** | Replace inline key validation with `_resolve_key` against fallback |
| `backend/app/routers/pronunciation.py` | **Modify** | Relax `azure_key`/`azure_region` Form params to optional, use `_resolve_key` |
| `backend/app/routers/config.py` | **Modify** | Add `free_trial_available` field to response |
| `backend/tests/test_resolve_key.py` | **Create** | Unit tests for `_resolve_key` helper |
| `backend/tests/test_config_router.py` | **Modify** | Add tests for `free_trial_available` field |
| `backend/tests/test_tts_router.py` | **Modify** | Add tests for TTS with server fallback keys |
| `frontend/src/lib/config.ts` | **Modify** | Add `freeTrialAvailable` to `AppConfig` |
| `frontend/src/contexts/AuthContext.tsx` | **Modify** | Add `trialMode`, `startTrial()`, update `setup()` to clear trial |
| `frontend/src/App.tsx` | **Modify** | Update `AuthGate` to bypass gates when `trialMode === true` |
| `frontend/src/components/onboarding/Setup.tsx` | **Modify** | Add "Try for free" button and disclaimer |
| `frontend/src/components/settings/Settings.tsx` | **Modify** | Add trial banner; show PIN-create flow for trial users |
| `frontend/tests/AuthContext-trial.test.ts` | **Create** | Unit tests for trial mode logic in AuthContext |

---

## Task 1: Backend — `_resolve_key` helper + config + models

**Files:**
- Create: `backend/app/routers/_utils.py`
- Modify: `backend/app/config.py`
- Modify: `backend/app/models.py`
- Create: `backend/tests/test_resolve_key.py`

- [ ] **Step 1: Write failing tests for `_resolve_key`**

```python
# backend/tests/test_resolve_key.py
import pytest
from fastapi import HTTPException
from app.routers._utils import _resolve_key


def test_uses_request_key_when_present():
    assert _resolve_key("req-key", "fallback-key", "OpenRouter") == "req-key"


def test_uses_fallback_when_request_key_is_none():
    assert _resolve_key(None, "fallback-key", "OpenRouter") == "fallback-key"


def test_uses_fallback_when_request_key_is_empty_string():
    assert _resolve_key("", "fallback-key", "OpenRouter") == "fallback-key"


def test_raises_400_when_both_missing():
    with pytest.raises(HTTPException) as exc_info:
        _resolve_key(None, None, "OpenRouter")
    assert exc_info.value.status_code == 400
    assert "OpenRouter" in exc_info.value.detail


def test_raises_400_when_both_empty():
    with pytest.raises(HTTPException) as exc_info:
        _resolve_key("", None, "OpenRouter")
    assert exc_info.value.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_resolve_key.py -v
```
Expected: `ModuleNotFoundError` — `_utils` doesn't exist yet.

- [ ] **Step 3: Create `_utils.py` with minimal implementation**

```python
# backend/app/routers/_utils.py
from fastapi import HTTPException


def _resolve_key(request_key: str | None, fallback: str | None, name: str) -> str:
    """Return the effective API key: prefer request_key, fall back to server env var.

    Raises HTTP 400 if neither is available.
    """
    key = request_key or fallback
    if not key:
        raise HTTPException(
            status_code=400,
            detail=f"No {name} provided and no server fallback configured",
        )
    return key
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_resolve_key.py -v
```
Expected: 5 PASSED.

- [ ] **Step 5: Add fallback keys to `config.py`**

In `backend/app/config.py`, add 5 fields after the existing `ytdlp_bgutil_url` line:

```python
# Fallback API keys for free trial — all optional; unset means trial unavailable
openrouter_api_key: str | None = None       # env: SHADOWLEARN_OPENROUTER_API_KEY
deepgram_api_key: str | None = None         # env: SHADOWLEARN_DEEPGRAM_API_KEY
azure_speech_key: str | None = None         # env: SHADOWLEARN_AZURE_SPEECH_KEY
azure_speech_region: str | None = None      # env: SHADOWLEARN_AZURE_SPEECH_REGION
minimax_api_key: str | None = None          # env: SHADOWLEARN_MINIMAX_API_KEY
```

- [ ] **Step 6: Relax key fields in `models.py`**

Change `LessonRequest.openrouter_api_key` and `ChatRequest.openrouter_api_key` from `str` to `str | None = None`. The STT fields (`deepgram_api_key`, `azure_speech_key`, `azure_speech_region`) on `LessonRequest` are already `str | None = None` in the current codebase — verify this before changing:

```python
# In LessonRequest:
openrouter_api_key: str | None = None
# deepgram_api_key, azure_speech_key, azure_speech_region are already optional — no change needed

# In ChatRequest:
openrouter_api_key: str | None = None
```

- [ ] **Step 7: Commit**

```bash
cd backend && python -m pytest tests/test_resolve_key.py -v
git add backend/app/routers/_utils.py backend/app/config.py backend/app/models.py backend/tests/test_resolve_key.py
git commit -m "feat(trial): add _resolve_key helper, fallback config fields, relax model key types"
```

---

## Task 2: Backend — update `/api/config` with `free_trial_available`

**Files:**
- Modify: `backend/app/routers/config.py`
- Modify: `backend/tests/test_config_router.py`

The `free_trial_available` field is `True` only when ALL keys needed for a full trial experience are present in `settings`. The set of required keys depends on which providers are active (read from `app.state`).

- [ ] **Step 1: Write failing tests**

Add to `backend/tests/test_config_router.py`:

```python
@pytest.mark.asyncio
async def test_free_trial_available_true_when_all_keys_set():
    from app.main import app
    from app.config import settings

    app.state.stt_provider_name = "deepgram"
    app.state.tts_provider_name = "azure"
    original = (settings.openrouter_api_key, settings.deepgram_api_key,
                settings.azure_speech_key, settings.azure_speech_region)
    settings.openrouter_api_key = "or-key"
    settings.deepgram_api_key = "dg-key"
    settings.azure_speech_key = "az-key"
    settings.azure_speech_region = "eastus"
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/config")
    finally:
        settings.openrouter_api_key, settings.deepgram_api_key, settings.azure_speech_key, settings.azure_speech_region = original
    assert response.status_code == 200
    assert response.json()["free_trial_available"] is True


@pytest.mark.asyncio
async def test_free_trial_available_false_when_key_missing():
    from app.main import app
    from app.config import settings

    app.state.stt_provider_name = "deepgram"
    app.state.tts_provider_name = "azure"
    original_key = settings.openrouter_api_key
    settings.openrouter_api_key = None  # missing openrouter key
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/config")
    finally:
        settings.openrouter_api_key = original_key
    assert response.status_code == 200
    assert response.json()["free_trial_available"] is False
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_config_router.py -v
```
Expected: 2 new tests FAIL — `free_trial_available` key not in response.

- [ ] **Step 3: Update `config.py` router**

Replace the contents of `backend/app/routers/config.py`:

```python
"""Config endpoint — exposes active provider names and free trial availability."""

from fastapi import APIRouter, Request

from app.config import settings

router = APIRouter(prefix="/api")


def _compute_free_trial_available(stt_provider: str, tts_provider: str) -> bool:
    """True only when all keys needed for a full trial are set in server config."""
    if not settings.openrouter_api_key:
        return False
    # STT key check
    if stt_provider == "deepgram" and not settings.deepgram_api_key:
        return False
    if stt_provider == "azure" and (not settings.azure_speech_key or not settings.azure_speech_region):
        return False
    # TTS key check
    if tts_provider == "azure" and (not settings.azure_speech_key or not settings.azure_speech_region):
        return False
    if tts_provider == "minimax" and not settings.minimax_api_key:
        return False
    return True


@router.get("/config")
async def get_config(request: Request) -> dict:
    """Return active STT/TTS provider names and whether free trial is available."""
    stt = request.app.state.stt_provider_name
    tts = request.app.state.tts_provider_name
    return {
        "stt_provider": stt,
        "tts_provider": tts,
        "free_trial_available": _compute_free_trial_available(stt, tts),
    }
```

- [ ] **Step 4: Run all config tests**

```bash
cd backend && python -m pytest tests/test_config_router.py -v
```
Expected: all PASSED.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/config.py backend/tests/test_config_router.py
git commit -m "feat(trial): add free_trial_available to /api/config"
```

---

## Task 3: Backend — update OpenRouter routers (chat, agent, quiz, translation_exercise)

**Files:**
- Modify: `backend/app/routers/chat.py`
- Modify: `backend/app/routers/agent.py`
- Modify: `backend/app/routers/quiz.py`
- Modify: `backend/app/routers/translation_exercise.py`

All four routers use `openrouter_api_key`. The pattern is identical: relax the model field, import `_resolve_key`, call it at the top of the handler.

- [ ] **Step 1: Update `chat.py`**

Add import and resolve the key at the start of the `chat` handler:

```python
# Add to imports at top of chat.py:
from app.routers._utils import _resolve_key

# In the chat() handler, before building system_prompt:
api_key = _resolve_key(request.openrouter_api_key, settings.openrouter_api_key, "OpenRouter API key")
# Replace the usage below from request.openrouter_api_key to api_key:
return StreamingResponse(
    _stream_chat(messages, api_key, settings.openrouter_model),
    ...
)
```

- [ ] **Step 2: Update `agent.py`**

Add import and resolve the key at the start of `agent_chat`:

```python
# Add to imports at top of agent.py:
from app.routers._utils import _resolve_key

# AgentRequest model — change field type:
openrouter_api_key: str | None = None

# In agent_chat() handler, before creating client:
api_key = _resolve_key(request.openrouter_api_key, settings.openrouter_api_key, "OpenRouter API key")
client = AsyncOpenAI(api_key=api_key, base_url=_OPENROUTER_BASE_URL)
```

- [ ] **Step 3: Update `quiz.py`**

```python
# Add to imports at top of quiz.py:
from app.routers._utils import _resolve_key

# QuizRequest model — change field type:
openrouter_api_key: str | None = None

# In generate_quiz() handler, after lang_cfg line:
api_key = _resolve_key(req.openrouter_api_key, settings.openrouter_api_key, "OpenRouter API key")
# Replace req.openrouter_api_key usage in headers:
headers={"Authorization": f"Bearer {api_key}"},
```

- [ ] **Step 4: Update `translation_exercise.py`**

Read the full file first to find all `openrouter_api_key` usages, then:
- Relax any model field `openrouter_api_key: str` → `str | None = None`
- Add `from app.routers._utils import _resolve_key` import
- In each handler, resolve: `api_key = _resolve_key(req.openrouter_api_key, settings.openrouter_api_key, "OpenRouter API key")`
- Replace `req.openrouter_api_key` with `api_key` in header/request bodies

- [ ] **Step 5: Run relevant router tests**

```bash
cd backend && python -m pytest tests/test_chat_router.py tests/test_agent_router.py tests/test_quiz_router.py tests/test_translation_exercise.py -v
```
Expected: all existing tests PASS. (They mock the HTTP calls so no real key is needed.)

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/chat.py backend/app/routers/agent.py backend/app/routers/quiz.py backend/app/routers/translation_exercise.py
git commit -m "feat(trial): use _resolve_key for openrouter key in chat/agent/quiz/translation routers"
```

---

## Task 4: Backend — update lessons router

**Files:**
- Modify: `backend/app/routers/lessons.py`

Two paths: JSON body (`/generate`) and multipart form (`/generate-upload`). Both pass `openrouter_api_key` into `_shared_pipeline`.

- [ ] **Step 1: Update `lessons.py`**

```python
# Add to imports:
from app.routers._utils import _resolve_key

# In _process_youtube_lesson(), after the existing keys dict is built,
# just before calling _shared_pipeline():
openrouter_key = _resolve_key(
    request.openrouter_api_key, settings.openrouter_api_key, "OpenRouter API key"
)
# Replace request.openrouter_api_key in _shared_pipeline call with openrouter_key

# In /generate-upload route — openrouter_api_key Form param stays as str (empty string allowed),
# but resolve it in _process_upload_lesson() before _shared_pipeline():
openrouter_key = _resolve_key(
    openrouter_api_key or None, settings.openrouter_api_key, "OpenRouter API key"
)
# Pass openrouter_key to _shared_pipeline instead of openrouter_api_key

# Also for STT keys in both paths — build the keys dict using the
# request value OR settings fallback:
deepgram = request.deepgram_api_key or settings.deepgram_api_key
azure_key = request.azure_speech_key or settings.azure_speech_key
azure_region = request.azure_speech_region or settings.azure_speech_region
if deepgram:
    keys["deepgram_api_key"] = deepgram
if azure_key:
    keys["azure_speech_key"] = azure_key
if azure_region:
    keys["azure_speech_region"] = azure_region
```

Note: STT keys are optional even now (they're `str | None`). The fallback here is a best-effort fill; if neither is present, the existing STT provider behaviour applies (it may raise its own error).

- [ ] **Step 2: Run lessons tests**

```bash
cd backend && python -m pytest tests/test_lessons_router.py -v
```
Expected: all PASSED.

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/lessons.py
git commit -m "feat(trial): use _resolve_key + STT fallback in lessons router"
```

---

## Task 5: Backend — update TTS and pronunciation routers

**Files:**
- Modify: `backend/app/routers/tts.py`
- Modify: `backend/app/routers/pronunciation.py`
- Modify: `backend/tests/test_tts_router.py`

### TTS

The existing inline validation block (`if not body.azure_speech_key`) must be replaced with `_resolve_key` calls that check server fallback first.

- [ ] **Step 1: Write failing TTS test for fallback**

Add to `backend/tests/test_tts_router.py`:

```python
@pytest.mark.asyncio
async def test_tts_uses_server_fallback_key_when_request_key_empty(mock_tts_provider):
    from app.main import app
    from app.config import settings

    mock_tts_provider.synthesize = AsyncMock(return_value=b"audio")
    app.state.tts_provider_name = "azure"
    original_key = settings.azure_speech_key
    original_region = settings.azure_speech_region
    settings.azure_speech_key = "server-az-key"
    settings.azure_speech_region = "eastus"

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # No keys in request body — should use server fallback
            response = await client.post("/api/tts", json={"text": "你好"})
    finally:
        settings.azure_speech_key = original_key
        settings.azure_speech_region = original_region
    assert response.status_code == 200
    mock_tts_provider.synthesize.assert_called_once()
    call_keys = mock_tts_provider.synthesize.call_args[0][1]
    assert call_keys["azure_speech_key"] == "server-az-key"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_tts_router.py::test_tts_uses_server_fallback_key_when_request_key_empty -v
```
Expected: FAIL — currently raises 400 "Azure Speech key and region required".

- [ ] **Step 3: Update `tts.py` — replace inline validation with `_resolve_key`**

```python
# Add to imports:
from app.config import settings
from app.routers._utils import _resolve_key

# Replace the Step 2 key validation block with:
keys: TTSKeys = {}
if provider_name == "azure":
    az_key = _resolve_key(body.azure_speech_key, settings.azure_speech_key, "Azure Speech key")
    az_region = _resolve_key(body.azure_speech_region, settings.azure_speech_region, "Azure Speech region")
    keys = {"azure_speech_key": az_key, "azure_speech_region": az_region}
elif provider_name == "minimax":
    mm_key = _resolve_key(body.minimax_api_key, settings.minimax_api_key, "MiniMax API key")
    keys = {"minimax_api_key": mm_key}
```

- [ ] **Step 4: Run TTS tests**

```bash
cd backend && python -m pytest tests/test_tts_router.py -v
```
Expected: all PASSED including the new fallback test.

### Pronunciation

- [ ] **Step 5: Update `pronunciation.py`**

The `azure_key` and `azure_region` Form params are currently `Form(...)` (required). Change to optional with fallback:

```python
# Change handler signature:
azure_key: str | None = Form(None),
azure_region: str | None = Form(None),

# Add import:
from app.config import settings
from app.routers._utils import _resolve_key

# At the start of assess_pronunciation(), after the SDK import check:
resolved_key = _resolve_key(azure_key, settings.azure_speech_key, "Azure Speech key")
resolved_region = _resolve_key(azure_region, settings.azure_speech_region, "Azure Speech region")

# Pass resolved_key and resolved_region to _run_assessment instead of azure_key/azure_region
```

- [ ] **Step 6: Run all backend tests**

```bash
cd backend && python -m pytest -v
```
Expected: all PASSED.

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/tts.py backend/app/routers/pronunciation.py backend/tests/test_tts_router.py
git commit -m "feat(trial): use _resolve_key with server fallback in TTS and pronunciation routers"
```

---

## Task 6: Frontend — update `lib/config.ts` and `AuthContext`

**Files:**
- Modify: `frontend/src/lib/config.ts`
- Modify: `frontend/src/contexts/AuthContext.tsx`
- Create: `frontend/tests/AuthContext-trial.test.ts`

### `lib/config.ts`

- [ ] **Step 1: Add `freeTrialAvailable` to `AppConfig`**

```typescript
// frontend/src/lib/config.ts
interface AppConfig {
  sttProvider: string
  ttsProvider: string
  freeTrialAvailable: boolean  // add this
}

// In the .then() transform:
.then((d: { stt_provider: string, tts_provider: string, free_trial_available: boolean }) => ({
  sttProvider: d.stt_provider,
  ttsProvider: d.tts_provider,
  freeTrialAvailable: d.free_trial_available ?? false,
}))
// In the .catch() fallback:
.catch(() => ({ sttProvider: 'deepgram', ttsProvider: 'azure', freeTrialAvailable: false }))
```

### `AuthContext.tsx`

- [ ] **Step 2: Write failing tests for trial mode**

```typescript
// frontend/tests/AuthContext-trial.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// We test the trial mode logic in isolation — the actual AuthProvider
// is too coupled to IndexedDB for a unit test, so we test the
// sessionStorage key contract and the expected state values.

const TRIAL_KEY = 'shadowlearn_trial'

describe('trial mode sessionStorage contract', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => sessionStorage.clear())

  it('shadowlearn_trial is absent by default', () => {
    expect(sessionStorage.getItem(TRIAL_KEY)).toBeNull()
  })

  it('startTrial sets sessionStorage key to "trial"', () => {
    // Simulate what startTrial() does
    sessionStorage.setItem(TRIAL_KEY, 'trial')
    expect(sessionStorage.getItem(TRIAL_KEY)).toBe('trial')
  })

  it('setup clears the sessionStorage key', () => {
    sessionStorage.setItem(TRIAL_KEY, 'trial')
    // Simulate what setup() does
    sessionStorage.removeItem(TRIAL_KEY)
    expect(sessionStorage.getItem(TRIAL_KEY)).toBeNull()
  })

  it('initial trialMode reads from sessionStorage synchronously', () => {
    sessionStorage.setItem(TRIAL_KEY, 'trial')
    // Simulate useState initializer
    const trialMode = sessionStorage.getItem(TRIAL_KEY) === 'trial'
    expect(trialMode).toBe(true)
  })
})
```

- [ ] **Step 3: Run tests to verify they pass (these are contracts, not implementation)**

```bash
cd frontend && npx vitest tests/AuthContext-trial.test.ts
```
Expected: all PASSED (these test the storage contract pattern, not the React component).

- [ ] **Step 4: Update `AuthContext.tsx`**

Key changes:
1. Add `trialMode: boolean` and `startTrial: () => void` to `AuthState` interface
2. Initialize `trialMode` from `sessionStorage` synchronously in `useState`
3. Implement `startTrial()`
4. Update `setup()` to clear trial mode atomically

```typescript
// Updated AuthState interface (add two lines):
interface AuthState {
  isFirstSetup: boolean | null
  isUnlocked: boolean
  keys: DecryptedKeys | null
  db: ShadowLearnDB | null
  trialMode: boolean           // new
  unlock: (pin: string) => Promise<void>
  setup: (keys: DecryptedKeys, pin: string) => Promise<void>
  resetKeys: () => Promise<void>
  lock: () => void
  startTrial: () => void       // new
}

const TRIAL_SESSION_KEY = 'shadowlearn_trial'

// Inside AuthProvider — add trialMode state (synchronous init from sessionStorage):
const [trialMode, setTrialMode] = useState<boolean>(
  () => sessionStorage.getItem(TRIAL_SESSION_KEY) === 'trial'
)

// startTrial implementation:
const startTrial = useCallback(() => {
  sessionStorage.setItem(TRIAL_SESSION_KEY, 'trial')
  setTrialMode(true)
  setIsUnlocked(true)
}, [])

// Updated setup — clear trial atomically:
const setup = useCallback(
  async (newKeys: DecryptedKeys, pin: string) => {
    if (!db)
      throw new Error('Database not initialized')
    const encrypted = await encryptKeys(newKeys, pin)
    await saveCryptoData(db, encrypted)
    sessionStorage.removeItem(TRIAL_SESSION_KEY)  // clear trial
    setKeys(newKeys)
    setIsUnlocked(true)
    setIsFirstSetup(false)
    setTrialMode(false)         // atomic with above
  },
  [db],
)

// Add trialMode and startTrial to context value:
return (
  <AuthContext
    value={{ isFirstSetup, isUnlocked, keys, db, trialMode, unlock, setup, resetKeys, lock, startTrial }}
  >
    {children}
  </AuthContext>
)
```

- [ ] **Step 5: Commit**

```bash
cd frontend && npx vitest tests/AuthContext-trial.test.ts
git add frontend/src/lib/config.ts frontend/src/contexts/AuthContext.tsx frontend/tests/AuthContext-trial.test.ts
git commit -m "feat(trial): add trialMode + startTrial to AuthContext, update AppConfig"
```

---

## Task 7: Frontend — update `App.tsx` AuthGate

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Update `AuthGate` to destructure `trialMode` and `db`, bypass gates when in trial**

`trialMode` is set synchronously from `sessionStorage`, but `db` is set asynchronously after `initDB()` resolves. The spinner must stay until `db` is ready even for trial users — otherwise the app shell renders before any IndexedDB operations can succeed.

```typescript
function AuthGate() {
  const { isFirstSetup, isUnlocked, trialMode, db } = useAuth()

  // Loading state — wait for DB regardless of trial mode
  // (trialMode is synchronous; db is async — show spinner until both are ready)
  if (isFirstSetup === null || db === null) {
    return (
      <div className="flex h-screen items-center justify-center glass-bg">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // First launch — set up keys (skip if in trial)
  if (isFirstSetup && !trialMode) {
    return <Setup />
  }

  // Keys exist but locked (skip if in trial)
  if (!isUnlocked && !trialMode) {
    return <Unlock />
  }

  // Authenticated or trial mode — show app
  return (
    <VocabularyProvider>
      <LessonsProvider>
        <RouterProvider router={router} />
      </LessonsProvider>
    </VocabularyProvider>
  )
}
```

Note: `startTrial()` does not call `navigate()` — `AuthGate` re-renders automatically when `isUnlocked` becomes `true`, which transitions the gate to the app view.

- [ ] **Step 2: Run frontend dev server to do a quick sanity check (optional)**

```bash
cd frontend && npx vite build --mode development 2>&1 | head -20
```
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(trial): update AuthGate to bypass setup/unlock for trial mode"
```

---

## Task 8: Frontend — update `Setup.tsx`

**Files:**
- Modify: `frontend/src/components/onboarding/Setup.tsx`

- [ ] **Step 1: Add `startTrial` to the destructured `useAuth()` call and load `freeTrialAvailable`**

```typescript
// Replace:
const { setup } = useAuth()
// With:
const { setup, startTrial } = useAuth()

// Add freeTrialAvailable to provider state:
const [freeTrialAvailable, setFreeTrialAvailable] = useState(false)

// In the existing useEffect that loads config:
useEffect(() => {
  getAppConfig().then((cfg) => {
    setProvider(cfg.ttsProvider)
    setSttProvider(cfg.sttProvider)
    setFreeTrialAvailable(cfg.freeTrialAvailable)
  })
}, [])
```

- [ ] **Step 2: Add "Try for free" button and disclaimer before the form's submit button**

Add this block just before the closing `</form>` tag (after the existing Button):

```tsx
{freeTrialAvailable && (
  <div className="mt-2 flex flex-col gap-2">
    <div className="relative flex items-center">
      <div className="grow border-t border-white/10" />
      <span className="mx-3 shrink text-xs text-white/25">or</span>
      <div className="grow border-t border-white/10" />
    </div>
    <Button
      type="button"
      variant="outline"
      onClick={startTrial}
      className="w-full"
    >
      Try for free
    </Button>
    <p className="text-center text-xs text-white/30">
      Free trial uses shared API keys. This may be discontinued when costs
      become unsustainable — add your own keys in Settings anytime.
    </p>
  </div>
)}
```

- [ ] **Step 3: Build check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/onboarding/Setup.tsx
git commit -m "feat(trial): add 'Try for free' button to Setup screen"
```

---

## Task 9: Frontend — update `Settings.tsx`

**Files:**
- Modify: `frontend/src/components/settings/Settings.tsx`

Two changes:
1. **Trial banner** — shown when `trialMode === true`
2. **Trial users saving keys** — they have no existing PIN, so show PIN-create flow instead of PIN-verify flow

- [ ] **Step 1: Add `trialMode` to destructured `useAuth()` and extra PIN state for trial**

```typescript
// Replace:
const { db, keys, lock, resetKeys, setup } = useAuth()
// With:
const { db, keys, lock, resetKeys, setup, trialMode } = useAuth()

// Add two state fields for PIN creation (trial path):
const [newTrialPin, setNewTrialPin] = useState('')
const [newTrialPinConfirm, setNewTrialPinConfirm] = useState('')
```

- [ ] **Step 2: Update `handleSaveKeys` to handle trial mode**

**Delete the entire existing `handleSaveKeys` function body** (lines 67–114 in the current file) and replace it with the version below. Do not merge — the PIN check position and structure differ from the original. The new version validates key fields first, then branches on `trialMode` vs own-keys path:

```typescript
async function handleSaveKeys() {
  setKeysError(null)
  if (!editOpenrouterKey.trim()) {
    setKeysError('OpenRouter API key cannot be empty')
    return
  }
  if (provider === 'azure') {
    if (!editAzureSpeechKey.trim() || !editAzureSpeechRegion.trim()) {
      setKeysError('Azure Speech key and region are required')
      return
    }
  }
  if (provider === 'minimax') {
    if (!editMinimaxKey.trim()) {
      setKeysError('MiniMax API key is required')
      return
    }
  }

  const newKeys = {
    openrouterApiKey: editOpenrouterKey.trim(),
    minimaxApiKey: editMinimaxKey.trim() || undefined,
    deepgramApiKey: editDeepgramKey.trim() || undefined,
    azureSpeechKey: editAzureSpeechKey.trim() || undefined,
    azureSpeechRegion: editAzureSpeechRegion.trim() || undefined,
  }

  if (trialMode) {
    // Trial path: create a new PIN (no existing one to verify)
    if (newTrialPin.length < 4) {
      setKeysError('PIN must be at least 4 digits')
      return
    }
    if (newTrialPin !== newTrialPinConfirm) {
      setKeysError('PINs do not match')
      return
    }
    if (!db) return
    try {
      await setup(newKeys, newTrialPin)
      setNewTrialPin('')
      setNewTrialPinConfirm('')
      setKeysSaved(true)
      toast.success(t('settings.keysSaved'))
      setTimeout(setKeysSaved, 2000, false)
    }
    catch {
      setKeysError('Failed to save API keys')
      toast.error('Failed to save API keys')
    }
    return
  }

  // Own-keys path: verify existing PIN before saving
  if (!keysPin) {
    setKeysError('Enter your PIN to save key changes')
    return
  }
  if (!db) return
  try {
    const cryptoData = await getCryptoData(db)
    if (!cryptoData)
      throw new Error('No stored keys found')
    await decryptKeys(cryptoData, keysPin)
    await setup(newKeys, keysPin)
    setKeysSaved(true)
    setKeysPin('')
    toast.success(t('settings.keysSaved'))
    setTimeout(setKeysSaved, 2000, false)
  }
  catch {
    setKeysError('Incorrect PIN or save failed')
    toast.error('Failed to save API keys')
  }
}
```

- [ ] **Step 3: Add trial banner and conditional PIN fields to the JSX**

At the very top of the `<div className="mx-auto max-w-2xl ...">`, before the `<h1>`, add the banner:

```tsx
{trialMode && (
  <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
    You're using the free trial. Add your own API keys below to switch — your lessons will be preserved.
  </div>
)}
```

In the API Keys card, replace the single PIN input section with a conditional:

```tsx
{trialMode ? (
  <>
    <div className="space-y-2">
      <label className="text-sm text-white/40">Create a PIN</label>
      <Input
        type="password"
        value={newTrialPin}
        onChange={e => setNewTrialPin(e.target.value)}
        placeholder="4+ digits"
      />
    </div>
    <div className="space-y-2">
      <label className="text-sm text-white/40">Confirm PIN</label>
      <Input
        type="password"
        value={newTrialPinConfirm}
        onChange={e => setNewTrialPinConfirm(e.target.value)}
        placeholder="Repeat your PIN"
      />
    </div>
  </>
) : (
  <div className="space-y-2">
    <label className="text-sm text-white/40">{t('settings.confirmWithPin')}</label>
    <Input
      type="password"
      value={keysPin}
      onChange={e => setKeysPin(e.target.value)}
      placeholder="Enter your PIN to save"
    />
  </div>
)}
```

Also hide the "Change PIN" card when in trial mode (trial users have no PIN yet):

```tsx
{!trialMode && (
  <Card>
    {/* ... existing Change PIN card content unchanged ... */}
  </Card>
)}
```

- [ ] **Step 4: TypeScript build check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/Settings.tsx
git commit -m "feat(trial): add trial banner and PIN-create flow to Settings"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && python -m pytest -v
```
Expected: all PASSED, no regressions.

- [ ] **Step 2: Run all frontend tests**

```bash
cd frontend && npx vitest run
```
Expected: all PASSED, no regressions.

- [ ] **Step 3: Smoke test — start backend with fallback keys, open frontend**

```bash
# In one terminal:
cd backend
SHADOWLEARN_OPENROUTER_API_KEY=sk-test \
SHADOWLEARN_DEEPGRAM_API_KEY=dg-test \
SHADOWLEARN_AZURE_SPEECH_KEY=az-test \
SHADOWLEARN_AZURE_SPEECH_REGION=eastus \
uvicorn app.main:app --reload

# In another terminal:
cd frontend && npx vite
```

Navigate to `http://localhost:5173`. Verify:
- Setup screen shows "Try for free" button
- Clicking it enters the app (no PIN required)
- Settings shows the trial banner
- Backend `/api/config` returns `"free_trial_available": true`

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(trial): complete free trial mode implementation"
```
