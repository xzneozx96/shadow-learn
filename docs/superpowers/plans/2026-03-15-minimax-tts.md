# Minimax TTS Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development
> (if subagents available) or superpowers:executing-plans to implement this
> plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Minimax TTS pronunciation playback (word-level and sentence-level)
to the shadowing companion, with persistent IndexedDB audio caching keyed by
text.

**Architecture:** A new FastAPI service+router proxies calls to the Minimax
`speech-2.6-turbo` API and returns raw MP3 bytes. A `useTTS` React hook
(receiving `db` and `keys` as params) manages playback and caches audio as Blobs
in a new IndexedDB `tts-cache` store. Two play buttons are added: one in
`WordTooltip` for word pronunciation and one per segment row in
`TranscriptPanel` for sentence pronunciation.

**Tech Stack:** Python `httpx` (already in backend), FastAPI, React, `idb`
(already in frontend), Lucide icons (`Volume2`, `Loader2`), shadcn `Button`,
`sonner` toast.

---

## Chunk 1: Backend — TTS service, router, tests

### Files

- Create: `backend/app/services/tts.py`
- Create: `backend/app/routers/tts.py`
- Create: `backend/tests/test_tts_service.py`
- Create: `backend/tests/test_tts_router.py`
- Modify: `backend/app/config.py`
- Modify: `backend/app/models.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/routers/__init__.py`

---

### Task 1: Add Minimax TTS URL to config

- [ ] **Step 1: Modify `backend/app/config.py`**

  Add `minimax_tts_url` field to the `Settings` class:

  ```python
  # backend/app/config.py
  from pydantic_settings import BaseSettings


  class Settings(BaseSettings):
      max_video_duration_seconds: int = 7200  # 2 hours
      max_upload_size_bytes: int = 2_147_483_648  # 2 GB
      allowed_video_formats: list[str] = ["mp4", "mkv", "webm", "mov"]
      translation_batch_size: int = 30
      translation_max_retries: int = 2
      openai_chat_url: str = "https://api.openai.com/v1/chat/completions"
      minimax_tts_url: str = "https://api.minimaxi.com/v1/t2a_v2"

      model_config = {"env_prefix": "SHADOWLEARN_"}


  settings = Settings()
  ```

- [ ] **Step 2: Add `TTSRequest` model to `backend/app/models.py`**

  ```python
  class TTSRequest(BaseModel):
      text: str
      minimax_api_key: str
  ```

---

### Task 2: TTS service

- [ ] **Step 1: Write the failing test — `backend/tests/test_tts_service.py`**

  ```python
  import base64
  import json
  import pytest
  from unittest.mock import AsyncMock, MagicMock, patch


  @pytest.mark.asyncio
  async def test_synthesize_speech_returns_mp3_bytes():
      """Service decodes hex audio from Minimax response."""
      fake_audio = b"\xff\xfb\x90\x00" * 10  # minimal fake mp3 bytes
      fake_hex = fake_audio.hex()
      fake_response_body = json.dumps({
          "data": {"audio": fake_hex},
          "base_resp": {"status_code": 0, "status_msg": "success"},
      })

      mock_response = MagicMock()
      mock_response.status_code = 200
      mock_response.json.return_value = {
          "data": {"audio": fake_hex},
          "base_resp": {"status_code": 0, "status_msg": "success"},
      }
      mock_response.raise_for_status = MagicMock()

      mock_client = AsyncMock()
      mock_client.__aenter__ = AsyncMock(return_value=mock_client)
      mock_client.__aexit__ = AsyncMock(return_value=None)
      mock_client.post = AsyncMock(return_value=mock_response)

      with patch("app.services.tts.httpx.AsyncClient", return_value=mock_client):
          from app.services.tts import synthesize_speech
          result = await synthesize_speech("你好", "test-key")

      assert result == fake_audio


  @pytest.mark.asyncio
  async def test_synthesize_speech_raises_on_api_error():
      """Service raises RuntimeError when Minimax returns non-zero status_code."""
      mock_response = MagicMock()
      mock_response.status_code = 200
      mock_response.json.return_value = {
          "base_resp": {"status_code": 1002, "status_msg": "Invalid API key"},
      }
      mock_response.raise_for_status = MagicMock()

      mock_client = AsyncMock()
      mock_client.__aenter__ = AsyncMock(return_value=mock_client)
      mock_client.__aexit__ = AsyncMock(return_value=None)
      mock_client.post = AsyncMock(return_value=mock_response)

      with patch("app.services.tts.httpx.AsyncClient", return_value=mock_client):
          from app.services.tts import synthesize_speech
          with pytest.raises(RuntimeError, match="Invalid API key"):
              await synthesize_speech("你好", "bad-key")


  @pytest.mark.asyncio
  async def test_synthesize_speech_rejects_empty_text():
      """Service raises ValueError for empty text."""
      from app.services.tts import synthesize_speech
      with pytest.raises(ValueError, match="text"):
          await synthesize_speech("", "key")


  @pytest.mark.asyncio
  async def test_synthesize_speech_rejects_oversized_text():
      """Service raises ValueError for text exceeding 10,000 chars."""
      from app.services.tts import synthesize_speech
      with pytest.raises(ValueError, match="10,000"):
          await synthesize_speech("a" * 10_001, "key")
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  cd backend && python -m pytest tests/test_tts_service.py -v
  ```

  Expected: `ModuleNotFoundError` for `app.services.tts`.

- [ ] **Step 3: Implement `backend/app/services/tts.py`**

  ```python
  """Minimax text-to-speech service."""

  import logging

  import httpx

  from app.config import settings

  logger = logging.getLogger(__name__)

  _VOICE_ID = "Calm_Woman"  # Chinese female voice; adjust if Minimax changes IDs


  async def synthesize_speech(text: str, api_key: str) -> bytes:
      """Call Minimax TTS API and return raw MP3 bytes.

      Args:
          text: The text to synthesize (must be 1-10,000 characters).
          api_key: Minimax API key supplied by the user.

      Returns:
          Raw MP3 audio bytes.

      Raises:
          ValueError: If text is empty or exceeds 10,000 characters.
          RuntimeError: If the Minimax API returns an error status.
          httpx.HTTPStatusError: If the HTTP request itself fails.
      """
      if not text:
          raise ValueError("text must not be empty")
      if len(text) > 10_000:
          raise ValueError("text exceeds the Minimax limit of 10,000 characters")

      payload = {
          "model": "speech-2.6-turbo",
          "text": text,
          "voice_setting": {
              "voice_id": _VOICE_ID,
          },
          "audio_setting": {
              "format": "mp3",
              "sample_rate": 32000,
          },
      }
      headers = {
          "Authorization": f"Bearer {api_key}",
          "Content-Type": "application/json",
      }

      async with httpx.AsyncClient(timeout=30.0) as client:
          response = await client.post(settings.minimax_tts_url, json=payload, headers=headers)
          response.raise_for_status()

      body = response.json()
      base_resp = body.get("base_resp", {})
      if base_resp.get("status_code", 0) != 0:
          msg = base_resp.get("status_msg", "Unknown Minimax error")
          logger.error("Minimax TTS error: %s", msg)
          raise RuntimeError(msg)

      audio_hex: str = body["data"]["audio"]
      return bytes.fromhex(audio_hex)
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  cd backend && python -m pytest tests/test_tts_service.py -v
  ```

  Expected: 4 PASSED.

---

### Task 3: TTS router

- [ ] **Step 1: Write the failing test — `backend/tests/test_tts_router.py`**

  ```python
  import pytest
  from unittest.mock import AsyncMock, patch
  from httpx import AsyncClient, ASGITransport
  from app.main import app


  @pytest.mark.asyncio
  async def test_tts_returns_audio():
      """POST /api/tts proxies to Minimax and returns audio/mpeg."""
      fake_mp3 = b"\xff\xfb\x90\x00" * 10

      with patch("app.routers.tts.synthesize_speech", new_callable=AsyncMock, return_value=fake_mp3):
          transport = ASGITransport(app=app)
          async with AsyncClient(transport=transport, base_url="http://test") as client:
              response = await client.post(
                  "/api/tts",
                  json={"text": "你好", "minimax_api_key": "test-key"},
              )

      assert response.status_code == 200
      assert response.headers["content-type"] == "audio/mpeg"
      assert response.content == fake_mp3


  @pytest.mark.asyncio
  async def test_tts_rejects_empty_text():
      """POST /api/tts returns 400 when text is empty."""
      transport = ASGITransport(app=app)
      async with AsyncClient(transport=transport, base_url="http://test") as client:
          response = await client.post(
              "/api/tts",
              json={"text": "", "minimax_api_key": "test-key"},
          )
      assert response.status_code == 400


  @pytest.mark.asyncio
  async def test_tts_returns_502_on_minimax_error():
      """POST /api/tts returns 502 when Minimax API call fails."""
      with patch(
          "app.routers.tts.synthesize_speech",
          new_callable=AsyncMock,
          side_effect=RuntimeError("Invalid API key"),
      ):
          transport = ASGITransport(app=app)
          async with AsyncClient(transport=transport, base_url="http://test") as client:
              response = await client.post(
                  "/api/tts",
                  json={"text": "你好", "minimax_api_key": "bad-key"},
              )
      assert response.status_code == 502
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  cd backend && python -m pytest tests/test_tts_router.py -v
  ```

  Expected: 404 errors (router not mounted yet).

- [ ] **Step 3: Implement `backend/app/routers/tts.py`**

  ```python
  """TTS router: proxies text-to-speech requests to Minimax."""

  import logging

  from fastapi import APIRouter, HTTPException
  from fastapi.responses import Response

  from app.models import TTSRequest
  from app.services.tts import synthesize_speech

  logger = logging.getLogger(__name__)

  router = APIRouter(prefix="/api")


  @router.post("/tts")
  async def text_to_speech(request: TTSRequest) -> Response:
      """Convert text to speech via Minimax and return MP3 audio bytes."""
      if not request.text.strip():
          raise HTTPException(status_code=400, detail="text must not be empty")

      try:
          audio_bytes = await synthesize_speech(request.text, request.minimax_api_key)
      except ValueError as exc:
          raise HTTPException(status_code=400, detail=str(exc))
      except Exception as exc:
          logger.exception("TTS synthesis failed: %s", exc)
          raise HTTPException(status_code=502, detail=str(exc))

      return Response(content=audio_bytes, media_type="audio/mpeg")
  ```

- [ ] **Step 4: Register the router in `backend/app/main.py`**

  ```python
  from app.routers import chat, lessons, tts

  # ...existing middleware...

  app.include_router(lessons.router)
  app.include_router(chat.router)
  app.include_router(tts.router)
  ```

- [ ] **Step 5: Export from `backend/app/routers/__init__.py`**

  Open `backend/app/routers/__init__.py`. If it's empty or only has imports,
  add:

  ```python
  from app.routers import tts
  ```

  If it's a blank `__init__.py`, leave it as-is — the import in `main.py` is
  sufficient.

- [ ] **Step 6: Run all router tests**

  ```bash
  cd backend && python -m pytest tests/test_tts_router.py -v
  ```

  Expected: 3 PASSED.

- [ ] **Step 7: Run full backend test suite**

  ```bash
  cd backend && python -m pytest -v
  ```

  Expected: all tests pass.

- [ ] **Step 8: Commit**

  ```bash
  git add backend/app/config.py backend/app/models.py backend/app/main.py \
          backend/app/routers/tts.py backend/app/services/tts.py \
          backend/tests/test_tts_service.py backend/tests/test_tts_router.py
  git commit -m "feat: add Minimax TTS backend service and /api/tts endpoint"
  ```

---

## Chunk 2: Frontend — IndexedDB cache + useTTS hook

### Files

- Modify: `frontend/src/db/index.ts`
- Create: `frontend/src/hooks/useTTS.ts`

---

### Task 4: Add `tts-cache` IndexedDB store

- [ ] **Step 1: Modify `frontend/src/db/index.ts`**

  Change `DB_VERSION` from `1` to `2` and add the `tts-cache` store in a
  version-gated block. Also add two cache helper functions at the bottom.

  Replace the `DB_VERSION` line and the `upgrade` handler:

  ```ts
  const DB_VERSION = 2;

  export async function initDB(): Promise<ShadowLearnDB> {
  	return openDB(DB_NAME, DB_VERSION, {
  		upgrade(db, oldVersion) {
  			if (oldVersion < 1) {
  				db.createObjectStore('lessons', { keyPath: 'id' });
  				db.createObjectStore('segments');
  				db.createObjectStore('videos');
  				db.createObjectStore('chats');
  				db.createObjectStore('settings');
  				db.createObjectStore('crypto');
  			}
  			if (oldVersion < 2) {
  				db.createObjectStore('tts-cache');
  			}
  		},
  	});
  }
  ```

  Add at the bottom of the file:

  ```ts
  // TTS audio cache (keyed by text, value is MP3 Blob)
  export async function getTTSCache(
  	db: ShadowLearnDB,
  	text: string,
  ): Promise<Blob | undefined> {
  	return db.get('tts-cache', text);
  }

  export async function saveTTSCache(
  	db: ShadowLearnDB,
  	text: string,
  	blob: Blob,
  ): Promise<void> {
  	await db.put('tts-cache', blob, text);
  }
  ```

  **Note:** Existing users upgrading from DB version 1 will have
  `oldVersion === 1`, so only the `< 2` block runs — their existing stores are
  untouched.

- [ ] **Step 2: Verify frontend builds**

  ```bash
  cd frontend && npm run build 2>&1 | tail -20
  ```

  Expected: no TypeScript errors.

---

### Task 5: Implement `useTTS` hook

- [ ] **Step 1: Write the failing test — `frontend/tests/useTTS.test.ts`**

  This uses Vitest (already the test runner for the frontend based on existing
  test files).

  ```ts
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { renderHook, act } from '@testing-library/react';
  import { useTTS } from '../src/hooks/useTTS';

  // Mock the db helpers
  vi.mock('../src/db', () => ({
  	getTTSCache: vi.fn(),
  	saveTTSCache: vi.fn(),
  }));

  // Mock sonner toast
  vi.mock('sonner', () => ({
  	toast: { error: vi.fn(), success: vi.fn() },
  }));

  import { getTTSCache, saveTTSCache } from '../src/db';
  import { toast } from 'sonner';

  const mockDb = {} as any;
  const mockKeys = { openaiApiKey: 'sk-test', minimaxApiKey: 'mm-test' };

  beforeEach(() => {
  	vi.clearAllMocks();
  	global.fetch = vi.fn();
  	global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  	global.URL.revokeObjectURL = vi.fn();
  });

  describe('useTTS', () => {
  	it('returns loadingText null initially', () => {
  		const { result } = renderHook(() => useTTS(mockDb, mockKeys));
  		expect(result.current.loadingText).toBeNull();
  	});

  	it('shows error toast when minimaxApiKey is missing', async () => {
  		const keysWithoutMinimax = { openaiApiKey: 'sk-test' };
  		const { result } = renderHook(() =>
  			useTTS(mockDb, keysWithoutMinimax as any),
  		);

  		await act(async () => {
  			await result.current.playTTS('你好');
  		});

  		expect(toast.error).toHaveBeenCalledWith(
  			expect.stringContaining('Minimax'),
  		);
  		expect(global.fetch).not.toHaveBeenCalled();
  	});

  	it('plays from cache without calling fetch', async () => {
  		const fakeBlob = new Blob([new Uint8Array([0xff, 0xfb])], {
  			type: 'audio/mpeg',
  		});
  		vi.mocked(getTTSCache).mockResolvedValueOnce(fakeBlob);

  		const { result } = renderHook(() => useTTS(mockDb, mockKeys));

  		await act(async () => {
  			await result.current.playTTS('你好');
  		});

  		expect(getTTSCache).toHaveBeenCalledWith(mockDb, '你好');
  		expect(global.fetch).not.toHaveBeenCalled();
  		expect(saveTTSCache).not.toHaveBeenCalled();
  	});

  	it('fetches from API on cache miss and stores result', async () => {
  		vi.mocked(getTTSCache).mockResolvedValueOnce(undefined);
  		const fakeBlob = new Blob([new Uint8Array([0xff, 0xfb])], {
  			type: 'audio/mpeg',
  		});
  		vi.mocked(global.fetch).mockResolvedValueOnce({
  			ok: true,
  			blob: () => Promise.resolve(fakeBlob),
  		} as any);

  		const { result } = renderHook(() => useTTS(mockDb, mockKeys));

  		await act(async () => {
  			await result.current.playTTS('你好');
  		});

  		expect(global.fetch).toHaveBeenCalledWith(
  			'/api/tts',
  			expect.objectContaining({
  				method: 'POST',
  				body: JSON.stringify({ text: '你好', minimax_api_key: 'mm-test' }),
  			}),
  		);
  		expect(saveTTSCache).toHaveBeenCalledWith(mockDb, '你好', fakeBlob);
  	});

  	it('shows error toast on API failure', async () => {
  		vi.mocked(getTTSCache).mockResolvedValueOnce(undefined);
  		vi.mocked(global.fetch).mockResolvedValueOnce({
  			ok: false,
  			statusText: 'Bad Gateway',
  		} as any);

  		const { result } = renderHook(() => useTTS(mockDb, mockKeys));

  		await act(async () => {
  			await result.current.playTTS('你好');
  		});

  		expect(toast.error).toHaveBeenCalled();
  	});

  	it('is a no-op for empty text', async () => {
  		const { result } = renderHook(() => useTTS(mockDb, mockKeys));

  		await act(async () => {
  			await result.current.playTTS('');
  		});

  		expect(getTTSCache).not.toHaveBeenCalled();
  		expect(global.fetch).not.toHaveBeenCalled();
  	});
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  cd frontend && npm test -- tests/useTTS.test.ts 2>&1 | tail -20
  ```

  Expected: `Cannot find module '../src/hooks/useTTS'`.

- [ ] **Step 3: Implement `frontend/src/hooks/useTTS.ts`**

  ```ts
  import type { ShadowLearnDB } from '@/db';
  import type { DecryptedKeys } from '@/types';
  import { useCallback, useRef, useState } from 'react';
  import { toast } from 'sonner';
  import { getTTSCache, saveTTSCache } from '@/db';

  interface UseTTSReturn {
  	playTTS: (text: string) => Promise<void>;
  	loadingText: string | null;
  }

  export function useTTS(
  	db: ShadowLearnDB | null,
  	keys: DecryptedKeys | null,
  ): UseTTSReturn {
  	const [loadingText, setLoadingText] = useState<string | null>(null);
  	const audioRef = useRef<HTMLAudioElement | null>(null);

  	const playTTS = useCallback(
  		async (text: string) => {
  			if (!text) return;

  			if (!keys?.minimaxApiKey) {
  				toast.error(
  					'Add your Minimax API key in Settings to use pronunciation',
  				);
  				return;
  			}

  			// Stop any currently playing audio
  			if (audioRef.current) {
  				audioRef.current.pause();
  				audioRef.current = null;
  			}

  			setLoadingText(text);

  			try {
  				let blob: Blob | undefined;

  				if (db) {
  					blob = await getTTSCache(db, text);
  				}

  				if (!blob) {
  					const response = await fetch('/api/tts', {
  						method: 'POST',
  						headers: { 'Content-Type': 'application/json' },
  						body: JSON.stringify({
  							text,
  							minimax_api_key: keys.minimaxApiKey,
  						}),
  					});

  					if (!response.ok) {
  						throw new Error(`TTS failed: ${response.statusText}`);
  					}

  					blob = await response.blob();

  					if (db) {
  						await saveTTSCache(db, text, blob);
  					}
  				}

  				const url = URL.createObjectURL(blob);
  				const audio = new Audio(url);
  				audioRef.current = audio;

  				audio.addEventListener('ended', () => URL.revokeObjectURL(url));
  				// Intentionally not awaited: play() returns a Promise but we want loadingText
  				// cleared as soon as playback starts (in finally), not when it finishes.
  				// The 'ended' listener handles cleanup.
  				audio.play().catch(() => {}); // suppress unhandled rejection if browser blocks autoplay
  			} catch (err) {
  				const msg =
  					err instanceof Error ? err.message : 'Pronunciation failed';
  				toast.error(msg);
  			} finally {
  				setLoadingText(null);
  			}
  		},
  		[db, keys],
  	);

  	return { playTTS, loadingText };
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  cd frontend && npm test -- tests/useTTS.test.ts 2>&1 | tail -20
  ```

  Expected: 6 tests PASSED.

- [ ] **Step 5: Verify full frontend build**

  ```bash
  cd frontend && npm run build 2>&1 | tail -20
  ```

  Expected: no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/db/index.ts frontend/src/hooks/useTTS.ts \
          frontend/tests/useTTS.test.ts
  git commit -m "feat: add tts-cache IndexedDB store and useTTS hook"
  ```

---

## Chunk 3: Frontend — Key management (types, Setup, Settings)

### Files

- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/components/onboarding/Setup.tsx`
- Modify: `frontend/src/components/settings/Settings.tsx`

---

### Task 6: Update `DecryptedKeys` type

- [ ] **Step 1: Modify `frontend/src/types.ts`**

  Change `DecryptedKeys` to:

  ```ts
  export interface DecryptedKeys {
  	openaiApiKey: string;
  	minimaxApiKey?: string;
  }
  ```

  No other changes needed. The field is optional so existing encrypted blobs
  (which have only `openaiApiKey`) continue to decrypt without error.

---

### Task 7: Add Minimax key field to Setup

- [ ] **Step 1: Modify `frontend/src/components/onboarding/Setup.tsx`**

  Add `minimaxApiKey` state and a new input field. The field is optional — the
  user can leave it blank and add it later in Settings.

  **State additions** (after the existing `openaiApiKey` state):

  ```ts
  const [minimaxApiKey, setMinimaxApiKey] = useState('');
  ```

  **Validation** — no change. Minimax key is optional.

  **In `handleSubmit`**, update the `setup` call:

  ```ts
  await setup(
  	{
  		openaiApiKey: openaiApiKey.trim(),
  		minimaxApiKey: minimaxApiKey.trim() || undefined,
  	},
  	pin,
  );
  ```

  **New input field** (add after the OpenAI input block, before the PIN inputs):

  ```tsx
  <div className='flex flex-col gap-1.5'>
  	<label
  		htmlFor='minimax'
  		className='text-sm font-medium text-slate-300'
  	>
  		Minimax API Key <span className='text-slate-500'>(optional)</span>
  	</label>
  	<Input
  		id='minimax'
  		type='password'
  		placeholder='eyJ...'
  		value={minimaxApiKey}
  		onChange={(e) => setMinimaxApiKey(e.target.value)}
  	/>
  	<p className='text-xs text-slate-500'>
  		Used for word and sentence pronunciation (TTS). Can be added later in
  		Settings.
  	</p>
  </div>
  ```

---

### Task 8: Update Settings to show and update Minimax key

- [ ] **Step 1: Modify `frontend/src/components/settings/Settings.tsx`**

  The Settings page currently shows the OpenAI key as read-only. We need to make
  both keys editable so the user can add/update the Minimax key. Add state for
  editable key values and a "Save Keys" button that uses `setup()` from
  AuthContext (which re-encrypts AND updates in-memory keys).

  **New state** — add after the existing state declarations:

  ```ts
  const [editOpenaiKey, setEditOpenaiKey] = useState(keys?.openaiApiKey ?? '');
  const [editMinimaxKey, setEditMinimaxKey] = useState(
  	keys?.minimaxApiKey ?? '',
  );
  const [keysPin, setKeysPin] = useState('');
  const [keysSaved, setKeysSaved] = useState(false);
  const [keysError, setKeysError] = useState<string | null>(null);
  ```

  **Also update `useAuth()` destructure** to include `setup`:

  ```ts
  const { db, keys, lock, resetKeys, setup } = useAuth();
  ```

  **Sync state when keys change** — add a `useEffect` to keep edit fields in
  sync when `keys` updates (e.g. after save):

  ```ts
  useEffect(() => {
  	setEditOpenaiKey(keys?.openaiApiKey ?? '');
  	setEditMinimaxKey(keys?.minimaxApiKey ?? '');
  }, [keys]);
  ```

  **New handler** `handleSaveKeys` — uses `setup()` which re-encrypts AND
  updates AuthContext in-memory keys in one call:

  ```ts
  async function handleSaveKeys() {
  	setKeysError(null);
  	if (!keysPin) {
  		setKeysError('Enter your PIN to save key changes');
  		return;
  	}
  	try {
  		const newKeys = {
  			openaiApiKey: editOpenaiKey.trim(),
  			minimaxApiKey: editMinimaxKey.trim() || undefined,
  		};
  		await setup(newKeys, keysPin);
  		setKeysSaved(true);
  		setKeysPin('');
  		toast.success('API keys updated');
  		setTimeout(setKeysSaved, 2000, false);
  	} catch {
  		setKeysError('Incorrect PIN or save failed');
  		toast.error('Failed to save API keys');
  	}
  }
  ```

  Note: `setup()` from AuthContext handles encryption, persistence to IndexedDB,
  and updating `keys` in memory — no need to call `encryptKeys`/`saveCryptoData`
  directly.

  **Updated API Keys card UI** — replace the read-only display with editable
  inputs + PIN + Save button:

  ```tsx
  <Card>
  	<CardHeader>
  		<CardTitle>API Keys</CardTitle>
  	</CardHeader>
  	<CardContent className='space-y-3'>
  		<div className='flex items-center justify-between'>
  			<span className='text-sm text-slate-400'>Visibility</span>
  			<Button
  				variant='ghost'
  				size='icon-sm'
  				onClick={() => setShowKeys(!showKeys)}
  			>
  				{showKeys ? (
  					<EyeOff className='size-4' />
  				) : (
  					<Eye className='size-4' />
  				)}
  			</Button>
  		</div>
  		<div className='space-y-2'>
  			<label className='text-xs text-slate-400'>OpenAI API Key</label>
  			<Input
  				type={showKeys ? 'text' : 'password'}
  				value={editOpenaiKey}
  				onChange={(e) => setEditOpenaiKey(e.target.value)}
  				className='font-mono text-xs'
  			/>
  		</div>
  		<div className='space-y-2'>
  			<label className='text-xs text-slate-400'>
  				Minimax API Key{' '}
  				<span className='text-slate-600'>(for pronunciation)</span>
  			</label>
  			<Input
  				type={showKeys ? 'text' : 'password'}
  				value={editMinimaxKey}
  				onChange={(e) => setEditMinimaxKey(e.target.value)}
  				className='font-mono text-xs'
  				placeholder='Leave blank to disable TTS'
  			/>
  		</div>
  		<div className='space-y-2'>
  			<label className='text-xs text-slate-400'>Confirm with PIN</label>
  			<Input
  				type='password'
  				value={keysPin}
  				onChange={(e) => setKeysPin(e.target.value)}
  				placeholder='Enter your PIN to save'
  			/>
  		</div>
  		{keysError && <p className='text-sm text-destructive'>{keysError}</p>}
  		{keysSaved && <p className='text-sm text-emerald-400'>Keys saved</p>}
  		<Button
  			size='sm'
  			onClick={handleSaveKeys}
  		>
  			Save Keys
  		</Button>
  	</CardContent>
  </Card>
  ```

  Remove the old `showKeys` toggle that showed masked keys read-only — the new
  inputs replace it. Also remove the now-unused `maskKey` helper function (lines
  24-28 in the current file) to avoid an ESLint unused-variable error.

- [ ] **Step 2: Build to check TypeScript**

  ```bash
  cd frontend && npm run build 2>&1 | tail -30
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/types.ts \
          frontend/src/components/onboarding/Setup.tsx \
          frontend/src/components/settings/Settings.tsx
  git commit -m "feat: add minimaxApiKey to DecryptedKeys, Setup, and Settings"
  ```

---

## Chunk 4: Frontend UI — Play buttons in WordTooltip and TranscriptPanel

### Files

- Modify: `frontend/src/components/lesson/WordTooltip.tsx`
- Modify: `frontend/src/components/lesson/TranscriptPanel.tsx`

---

### Task 9: Add play button to WordTooltip

- [ ] **Step 1: Modify `frontend/src/components/lesson/WordTooltip.tsx`**

  Add `playTTS` and `loadingText` props, and a play button next to the copy
  button.

  **Update imports:**

  ```ts
  import { Check, Copy, Loader2, Volume2 } from 'lucide-react';
  ```

  **Update `WordTooltipProps`:**

  ```ts
  interface WordTooltipProps {
  	text: string;
  	words: Word[];
  	playTTS: (text: string) => Promise<void>;
  	loadingText: string | null;
  }
  ```

  **Update function signature:**

  ```ts
  export function WordTooltip({ text, words, playTTS, loadingText }: WordTooltipProps) {
  ```

  **Update the button area** — change from one button to two. The existing copy
  button is positioned `absolute top-1 right-1`. Change it to a flex row so the
  two buttons sit side by side. Replace:

  ```tsx
  {
  	/* Copy Button - Positioned absolutely in the corner */
  }
  <Button
  	variant='ghost'
  	size='icon-xs'
  	className='absolute top-1 right-1 size-7 text-slate-500 hover:bg-slate-800 hover:text-white'
  	onClick={(e) => {
  		e.preventDefault();
  		e.stopPropagation();
  		handleCopy(span.word!.word);
  	}}
  >
  	{copiedWord === span.word.word ? (
  		<Check className='size-4 text-emerald-400' />
  	) : (
  		<Copy className='size-4' />
  	)}
  </Button>;
  ```

  With:

  ```tsx
  {
  	/* Action buttons - top-right corner */
  }
  <div className='absolute top-1 right-1 flex gap-0.5'>
  	<Button
  		variant='ghost'
  		size='icon-xs'
  		className='size-7 text-slate-500 hover:bg-slate-800 hover:text-white'
  		onClick={(e) => {
  			e.preventDefault();
  			e.stopPropagation();
  			playTTS(span.word!.word);
  		}}
  	>
  		{loadingText === span.word.word ? (
  			<Loader2 className='size-4 animate-spin' />
  		) : (
  			<Volume2 className='size-4' />
  		)}
  	</Button>
  	<Button
  		variant='ghost'
  		size='icon-xs'
  		className='size-7 text-slate-500 hover:bg-slate-800 hover:text-white'
  		onClick={(e) => {
  			e.preventDefault();
  			e.stopPropagation();
  			handleCopy(span.word!.word);
  		}}
  	>
  		{copiedWord === span.word.word ? (
  			<Check className='size-4 text-emerald-400' />
  		) : (
  			<Copy className='size-4' />
  		)}
  	</Button>
  </div>;
  ```

---

### Task 10: Add sentence-level play button and wire useTTS in TranscriptPanel

- [ ] **Step 1: Modify `frontend/src/components/lesson/TranscriptPanel.tsx`**

  **Update imports** — merge new icons into the existing lucide import, add
  `useTTS` and `useAuth`. The existing `Button` import is already present, do
  not add a duplicate:

  ```ts
  // Merge into existing lucide import:
  import { Loader2, Search, Volume2 } from 'lucide-react';
  // Add new imports:
  import { useTTS } from '@/hooks/useTTS';
  import { useAuth } from '@/contexts/AuthContext';
  // (Button import is already present — do not duplicate)
  ```

  **Update `TranscriptPanelProps`** — no changes needed to the props interface.

  **Inside the component**, get `db` and `keys` from auth and instantiate the
  hook:

  ```ts
  const { db, keys } = useAuth();
  const { playTTS, loadingText } = useTTS(db, keys);
  ```

  **Pass props to `WordTooltip`:**

  ```tsx
  <WordTooltip
  	text={segment.chinese}
  	words={segment.words}
  	playTTS={playTTS}
  	loadingText={loadingText}
  />
  ```

  **Add sentence-level play button** to each segment row. Add a play button
  between the pinyin line and the Chinese text:

  ```tsx
  {
  	/* Pinyin + sentence play button */
  }
  <div className='mb-0.5 flex items-center gap-1.5'>
  	<p className='text-xs text-muted-foreground'>{segment.pinyin}</p>
  	<Button
  		variant='ghost'
  		size='icon-xs'
  		className='size-5 shrink-0 text-muted-foreground hover:text-foreground'
  		onClick={(e) => {
  			e.stopPropagation();
  			playTTS(segment.chinese);
  		}}
  	>
  		{loadingText === segment.chinese ? (
  			<Loader2 className='size-4 animate-spin' />
  		) : (
  			<Volume2 className='size-4' />
  		)}
  	</Button>
  </div>;
  ```

  Remove the old standalone
  `<p className="mb-0.5 text-xs text-muted-foreground">` pinyin line since it's
  now inside the flex div.

- [ ] **Step 2: Build to check TypeScript**

  ```bash
  cd frontend && npm run build 2>&1 | tail -30
  ```

  Expected: no errors.

- [ ] **Step 3: Run full frontend test suite**

  ```bash
  cd frontend && npm test 2>&1 | tail -20
  ```

  Expected: all tests pass.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/components/lesson/WordTooltip.tsx \
          frontend/src/components/lesson/TranscriptPanel.tsx
  git commit -m "feat: add TTS play buttons to WordTooltip and TranscriptPanel"
  ```

- [ ] **Step 5: Final integration check — run both backend and frontend tests**

  ```bash
  cd backend && python -m pytest -v
  cd frontend && npm test
  ```

  Expected: all tests green on both sides.
