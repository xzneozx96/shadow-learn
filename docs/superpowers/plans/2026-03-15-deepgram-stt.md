# Deepgram STT Integration Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace OpenAI Whisper with Deepgram nova-3 for audio transcription, with diarization, punctuation, and auto language detection — while keeping OpenAI for translation and chat.

**Architecture:** Add `transcribe_audio_deepgram()` alongside the existing Whisper function in `transcription.py`, reusing the existing `_group_words_into_segments()` logic. When the user provides a `deepgram_api_key`, the pipeline picks Deepgram; otherwise falls back to Whisper. The key is stored encrypted in the frontend alongside OpenAI and Minimax keys.

**Tech Stack:** Python httpx (already used), Deepgram REST API v1 (`/v1/listen`), React + shadcn/ui

---

## Chunk 1: Backend — Deepgram transcription service

### Task 1: Add Deepgram word-normalizer and transcription function

**Files:**
- Modify: `backend/app/services/transcription.py`
- Modify: `backend/tests/test_transcription.py`

Deepgram's word objects look like:
```json
{"word": "你", "start": 9.28, "end": 9.44, "confidence": 0.94, "speaker": 0, "punctuated_word": "你"}
```
Some `punctuated_word` values embed punctuation mid-token (e.g. `"么?我"` = the question mark plus the next character). We normalise each word to use `punctuated_word` as `text`, which the existing `_group_words_into_segments` already handles (it checks `text[-1] in _SENTENCE_ENDINGS`).

The Deepgram file upload API accepts raw audio bytes in the request body:
```
POST https://api.deepgram.com/v1/listen?diarize=true&punctuate=true&smart_format=true&detect_language=true&model=nova-3
Authorization: Token {api_key}
Content-Type: audio/mpeg   # (or audio/wav etc.)
Body: <raw audio bytes>
```

- [ ] **Step 1: Write failing tests for Deepgram normalizer and transcriber**

Add to `backend/tests/test_transcription.py`:

```python
from app.services.transcription import transcribe_audio_deepgram, _normalize_deepgram_words


def test_normalize_deepgram_words_uses_punctuated_word():
    """punctuated_word becomes text; start/end preserved."""
    raw = [
        {"word": "你", "start": 0.0, "end": 0.3, "punctuated_word": "你", "speaker": 0},
        {"word": "好", "start": 0.4, "end": 0.8, "punctuated_word": "好。", "speaker": 0},
    ]
    result = _normalize_deepgram_words(raw)
    assert result == [
        {"text": "你", "start": 0.0, "end": 0.3},
        {"text": "好。", "start": 0.4, "end": 0.8},
    ]


def test_normalize_deepgram_words_fallback_to_word_key():
    """Falls back to 'word' key when 'punctuated_word' is absent."""
    raw = [{"word": "你", "start": 0.0, "end": 0.3}]
    result = _normalize_deepgram_words(raw)
    assert result[0]["text"] == "你"


@pytest.mark.asyncio
async def test_transcribe_audio_deepgram_returns_segments(tmp_path):
    """Mock Deepgram response, verify segments returned via existing grouper."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio data")

    mock_json = {
        "results": {
            "channels": [{
                "alternatives": [{
                    "words": [
                        {"word": "你好", "start": 0.0, "end": 0.5, "punctuated_word": "你好", "speaker": 0},
                        {"word": "世界", "start": 0.5, "end": 1.0, "punctuated_word": "世界。", "speaker": 0},
                        {"word": "谢谢", "start": 3.0, "end": 3.5, "punctuated_word": "谢谢", "speaker": 1},
                        {"word": "你", "start": 3.5, "end": 4.0, "punctuated_word": "你！", "speaker": 1},
                    ]
                }]
            }]
        }
    }

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = mock_json
    mock_response.raise_for_status = MagicMock()

    with patch("app.services.transcription.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        segments = await transcribe_audio_deepgram(audio_file, api_key="test_key")

    assert len(segments) == 2
    assert segments[0]["text"] == "你好世界。"
    assert segments[0]["start"] == 0.0
    assert segments[1]["text"] == "谢谢你！"
    assert segments[1]["start"] == 3.0


@pytest.mark.asyncio
async def test_transcribe_audio_deepgram_raises_on_api_error(tmp_path):
    """Mock 401, verify raises HTTPStatusError."""
    audio_file = tmp_path / "test.mp3"
    audio_file.write_bytes(b"fake audio data")

    mock_response = MagicMock()
    mock_response.status_code = 401
    mock_response.text = "Unauthorized"
    mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "401 Unauthorized",
        request=MagicMock(),
        response=mock_response,
    )

    with patch("app.services.transcription.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        with pytest.raises(httpx.HTTPStatusError):
            await transcribe_audio_deepgram(audio_file, api_key="bad_key")
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend && python -m pytest tests/test_transcription.py::test_normalize_deepgram_words_uses_punctuated_word tests/test_transcription.py::test_normalize_deepgram_words_fallback_to_word_key tests/test_transcription.py::test_transcribe_audio_deepgram_returns_segments tests/test_transcription.py::test_transcribe_audio_deepgram_raises_on_api_error -v
```
Expected: 4 FAILs with `ImportError` or `cannot import name`.

- [ ] **Step 3: Implement `_normalize_deepgram_words` and `transcribe_audio_deepgram`**

Add to the end of `backend/app/services/transcription.py`:

```python
_DEEPGRAM_TRANSCRIPTION_URL = "https://api.deepgram.com/v1/listen"
_DEEPGRAM_PARAMS = {
    "diarize": "true",
    "punctuate": "true",
    "smart_format": "true",
    "detect_language": "true",
    "model": "nova-3",
}


def _normalize_deepgram_words(words: list[dict]) -> list[dict]:
    """Convert Deepgram word objects to the internal {text, start, end} format."""
    return [
        {
            "text": w.get("punctuated_word") or w.get("word", ""),
            "start": w["start"],
            "end": w["end"],
        }
        for w in words
    ]


async def transcribe_audio_deepgram(audio_path: Path, api_key: str) -> list[dict]:
    """Transcribe an audio file using the Deepgram nova-3 API.

    Sends the raw audio bytes, requests diarization + punctuation + smart_format.
    Returns a list of segment dicts with keys: id, start, end, text.
    """
    file_size = audio_path.stat().st_size
    logger.info("Transcribing %s (%.1f MB) with Deepgram nova-3", audio_path.name, file_size / 1024 / 1024)

    suffix = audio_path.suffix.lower().lstrip(".")
    content_type = f"audio/{suffix}" if suffix else "audio/mpeg"

    async with httpx.AsyncClient(timeout=300.0) as client:
        with audio_path.open("rb") as f:
            audio_bytes = f.read()

        response = await client.post(
            _DEEPGRAM_TRANSCRIPTION_URL,
            params=_DEEPGRAM_PARAMS,
            headers={
                "Authorization": f"Token {api_key}",
                "Content-Type": content_type,
            },
            content=audio_bytes,
        )

    if response.status_code != 200:
        logger.error("Deepgram API error %d: %s", response.status_code, response.text[:500])
    response.raise_for_status()

    data = response.json()
    raw_words: list[dict] = (
        data.get("results", {})
        .get("channels", [{}])[0]
        .get("alternatives", [{}])[0]
        .get("words", [])
    )

    if not raw_words:
        logger.warning("Deepgram returned no words — empty transcript")
        return []

    logger.info("Deepgram transcription complete: %d words", len(raw_words))
    words = _normalize_deepgram_words(raw_words)
    return _group_words_into_segments(words)
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd backend && python -m pytest tests/test_transcription.py -v
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/transcription.py backend/tests/test_transcription.py
git commit -m "feat: add Deepgram nova-3 transcription service"
```

---

## Chunk 2: Backend — Route Deepgram through the pipeline

### Task 2: Thread deepgram_api_key through models and router

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/routers/lessons.py`
- Modify: `backend/tests/test_lessons_router.py`

The router currently calls `transcribe_audio(audio_path, request.openai_api_key)`. We add an optional `deepgram_api_key` field; when present, call `transcribe_audio_deepgram` instead.

- [ ] **Step 1: Write failing test for Deepgram routing**

Add to `backend/tests/test_lessons_router.py`:

```python
@pytest.mark.asyncio
async def test_generate_lesson_accepts_deepgram_key_in_body():
    """LessonRequest with deepgram_api_key should be accepted (422-free)."""
    from app.models import LessonRequest
    req = LessonRequest(
        source="youtube",
        youtube_url="https://www.youtube.com/watch?v=test",
        translation_languages=["en"],
        openai_api_key="sk-test",
        deepgram_api_key="dg-test",
    )
    assert req.deepgram_api_key == "dg-test"


@pytest.mark.asyncio
async def test_generate_lesson_deepgram_key_defaults_to_none():
    """deepgram_api_key is optional and defaults to None."""
    from app.models import LessonRequest
    req = LessonRequest(
        source="youtube",
        youtube_url="https://www.youtube.com/watch?v=test",
        translation_languages=["en"],
        openai_api_key="sk-test",
    )
    assert req.deepgram_api_key is None
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd backend && python -m pytest tests/test_lessons_router.py::test_generate_lesson_accepts_deepgram_key_in_body tests/test_lessons_router.py::test_generate_lesson_deepgram_key_defaults_to_none -v
```
Expected: 2 FAILs with `ValidationError` or attribute error.

- [ ] **Step 3: Add `deepgram_api_key` to `LessonRequest`**

In `backend/app/models.py`, change:
```python
class LessonRequest(BaseModel):
    source: str = Field(pattern=r"^(youtube|upload)$")
    youtube_url: str | None = None
    translation_languages: list[str] = Field(min_length=1)
    openai_api_key: str
    model: str = "gpt-4o-mini"
```
To:
```python
class LessonRequest(BaseModel):
    source: str = Field(pattern=r"^(youtube|upload)$")
    youtube_url: str | None = None
    translation_languages: list[str] = Field(min_length=1)
    openai_api_key: str
    deepgram_api_key: str | None = None
    model: str = "gpt-4o-mini"
```

- [ ] **Step 4: Run model tests to verify they pass**

```
cd backend && python -m pytest tests/test_lessons_router.py::test_generate_lesson_accepts_deepgram_key_in_body tests/test_lessons_router.py::test_generate_lesson_deepgram_key_defaults_to_none -v
```
Expected: 2 PASSes.

- [ ] **Step 5: Update the router to call Deepgram when key is present**

In `backend/app/routers/lessons.py`, add the import at the top:
```python
from app.services.transcription import transcribe_audio, transcribe_audio_deepgram
```

Then in `_process_youtube_lesson`, replace:
```python
        yield _sse_event("progress", {"step": "transcription", "message": "Transcribing audio..."})
        segments = await transcribe_audio(audio_path, request.openai_api_key)
```
With:
```python
        yield _sse_event("progress", {"step": "transcription", "message": "Transcribing audio..."})
        if request.deepgram_api_key:
            segments = await transcribe_audio_deepgram(audio_path, request.deepgram_api_key)
        else:
            segments = await transcribe_audio(audio_path, request.openai_api_key)
```

For the upload route, add `deepgram_api_key` as an optional form field.

Change the signature of `_process_upload_lesson`:
```python
async def _process_upload_lesson(
    file: UploadFile,
    translation_languages: list[str],
    openai_api_key: str,
    model: str,
    deepgram_api_key: str | None = None,
) -> AsyncGenerator[str, None]:
```

Replace the transcription call inside `_process_upload_lesson`:
```python
        yield _sse_event("progress", {"step": "transcription", "message": "Transcribing audio..."})
        if deepgram_api_key:
            segments = await transcribe_audio_deepgram(audio_path, deepgram_api_key)
        else:
            segments = await transcribe_audio(audio_path, openai_api_key)
```

Update the `generate_lesson_upload` endpoint signature:
```python
@router.post("/generate-upload")
async def generate_lesson_upload(
    file: UploadFile,
    translation_languages: str = Form(...),
    openai_api_key: str = Form(...),
    model: str = Form("gpt-4o-mini"),
    deepgram_api_key: str | None = Form(None),
) -> StreamingResponse:
```

And pass `deepgram_api_key` to the generator call:
```python
    generator = _process_upload_lesson(
        file,
        languages,
        openai_api_key,
        api_model,
        deepgram_api_key=deepgram_api_key,
    )
```

- [ ] **Step 6: Run all backend tests**

```
cd backend && python -m pytest -v
```
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models.py backend/app/routers/lessons.py backend/tests/test_lessons_router.py
git commit -m "feat: route transcription through Deepgram when deepgram_api_key is provided"
```

---

## Chunk 3: Frontend — Store and expose Deepgram key

### Task 3: Add Deepgram key to encrypted storage, Setup, and Settings

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/components/onboarding/Setup.tsx`
- Modify: `frontend/src/components/settings/Settings.tsx`

`DecryptedKeys` is the shape of the encrypted payload stored in IndexedDB. Adding `deepgramApiKey` is backward-compatible — existing stored blobs without this key will simply decrypt to `undefined`.

- [ ] **Step 1: Add `deepgramApiKey` to `DecryptedKeys`**

In `frontend/src/types.ts`, change:
```typescript
export interface DecryptedKeys {
  openaiApiKey: string
  minimaxApiKey?: string
}
```
To:
```typescript
export interface DecryptedKeys {
  openaiApiKey: string
  minimaxApiKey?: string
  deepgramApiKey?: string
}
```

- [ ] **Step 2: Add Deepgram key field to Setup screen**

In `frontend/src/components/onboarding/Setup.tsx`:

Add state:
```tsx
const [deepgramApiKey, setDeepgramApiKey] = useState('')
```

Pass it to `setup()`:
```tsx
await setup(
  {
    openaiApiKey: openaiApiKey.trim(),
    minimaxApiKey: minimaxApiKey.trim() || undefined,
    deepgramApiKey: deepgramApiKey.trim() || undefined,
  },
  pin,
)
```

Add the input field after the Minimax block:
```tsx
<div className="flex flex-col gap-1.5">
  <label htmlFor="deepgram" className="text-sm font-medium text-white/65">
    Deepgram API Key{' '}
    <span className="text-white/30">(optional)</span>
  </label>
  <Input
    id="deepgram"
    type="password"
    placeholder="..."
    value={deepgramApiKey}
    onChange={e => setDeepgramApiKey(e.target.value)}
  />
  <p className="text-xs text-white/30">
    Used for transcription (faster, more accurate than Whisper). Can be added later in Settings.
  </p>
</div>
```

- [ ] **Step 3: Add Deepgram key field to Settings screen**

In `frontend/src/components/settings/Settings.tsx`:

Add state:
```tsx
const [editDeepgramKey, setEditDeepgramKey] = useState(keys?.deepgramApiKey ?? '')
```

In the `useEffect` that syncs keys:
```tsx
useEffect(() => {
  setEditOpenaiKey(keys?.openaiApiKey ?? '')
  setEditMinimaxKey(keys?.minimaxApiKey ?? '')
  setEditDeepgramKey(keys?.deepgramApiKey ?? '')
}, [keys])
```

In `handleSaveKeys`, include the new key:
```tsx
const newKeys = {
  openaiApiKey: editOpenaiKey.trim(),
  minimaxApiKey: editMinimaxKey.trim() || undefined,
  deepgramApiKey: editDeepgramKey.trim() || undefined,
}
```

Add the input field after the Minimax input in JSX:
```tsx
<div className="space-y-2">
  <label className="text-xs text-white/40">
    Deepgram API Key
    {' '}
    <span className="text-white/20">(for transcription)</span>
  </label>
  <Input
    type={showKeys ? 'text' : 'password'}
    value={editDeepgramKey}
    onChange={e => setEditDeepgramKey(e.target.value)}
    className="font-mono text-xs"
    placeholder="Leave blank to use Whisper"
  />
</div>
```

- [ ] **Step 4: Verify frontend type-checks**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types.ts frontend/src/components/onboarding/Setup.tsx frontend/src/components/settings/Settings.tsx
git commit -m "feat: add Deepgram API key to encrypted key store, Setup, and Settings"
```

---

## Chunk 4: Frontend — Send Deepgram key in lesson creation requests

### Task 4: Pass `deepgram_api_key` from context to backend

**Files:**
- Modify: `frontend/src/components/create/CreateLesson.tsx`

When the user has configured a Deepgram key, send it in both the JSON body (YouTube) and the FormData (Upload). The backend ignores it if absent, so no change needed when it's undefined.

- [ ] **Step 1: Update CreateLesson to send deepgram_api_key**

In `frontend/src/components/create/CreateLesson.tsx`, inside `handleGenerate`:

For the YouTube branch, add `deepgram_api_key` to the JSON body:
```tsx
body: JSON.stringify({
  source: 'youtube',
  youtube_url: youtubeUrl,
  translation_languages: [language],
  openai_api_key: keys.openaiApiKey,
  deepgram_api_key: keys.deepgramApiKey ?? null,
  model: model || 'gpt-4o-mini',
}),
```

For the upload branch, append the key to FormData:
```tsx
formData.append('translation_languages', language)
formData.append('openai_api_key', keys.openaiApiKey)
formData.append('model', model || 'gpt-4o-mini')
if (keys.deepgramApiKey) {
  formData.append('deepgram_api_key', keys.deepgramApiKey)
}
```

- [ ] **Step 2: Verify frontend type-checks**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Run frontend lint**

```bash
cd frontend && npx eslint src/components/create/CreateLesson.tsx
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/create/CreateLesson.tsx
git commit -m "feat: send deepgram_api_key in lesson generation requests"
```

---

## Manual Smoke Test

After all tasks are done:

1. In Settings, add a Deepgram API key (get one free at console.deepgram.com)
2. Create a new lesson from a YouTube URL with Mandarin Chinese content
3. Verify the `transcription` step completes with a Deepgram key present
4. Verify segments have proper punctuation and are sentence-boundary split
5. Confirm lesson plays normally with word/segment highlighting

To verify Deepgram is being called (not Whisper), check backend logs for:
```
Transcribing ... with Deepgram nova-3
Deepgram transcription complete: N words
```
