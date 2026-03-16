# Azure TTS Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace MiniMax TTS with Azure Cognitive Services TTS as the default provider, controlled by a `SHADOWLEARN_TTS_PROVIDER` env var, reusing the existing `azureSpeechKey`/`azureSpeechRegion` keys users already store.

**Architecture:** A `TTSProvider` protocol abstracts synthesis behind a common interface. A factory reads `settings.tts_provider` at startup and stores the resolved provider in `app.state.tts_provider`. The frontend fetches `GET /api/tts/provider` once on mount to know which keys to send.

**Tech Stack:** Python/FastAPI (backend), React/TypeScript (frontend), httpx (async HTTP), Azure Cognitive Services TTS REST API (no SDK), Vitest (frontend tests), pytest-asyncio (backend tests)

---

## Chunk 1: Backend Foundation

Files in this chunk:
- Create: `backend/app/services/tts_provider.py`
- Create: `backend/app/services/tts_factory.py`
- Rename: `backend/app/services/tts.py` → `backend/app/services/tts_minimax.py`
- Modify: `backend/app/config.py`
- Modify: `backend/app/main.py`
- Rename+Modify: `backend/tests/test_tts_service.py` → `backend/tests/test_tts_minimax_service.py`
- Modify: `backend/tests/conftest.py`

---

### Task 1: Define TTSProvider protocol and TTSKeys TypedDict

**Files:**
- Create: `backend/app/services/tts_provider.py`

- [ ] **Step 1: Create the protocol file**

```python
# backend/app/services/tts_provider.py
"""Abstract TTS provider protocol and shared key types."""

from typing import Protocol, TypedDict


class TTSKeys(TypedDict, total=False):
    minimax_api_key: str
    azure_speech_key: str
    azure_speech_region: str


class TTSProvider(Protocol):
    async def synthesize(self, text: str, keys: TTSKeys) -> bytes:
        """Synthesize text to MP3 bytes.

        Args:
            text: Text to synthesize. Must be non-empty and within provider limits.
            keys: Provider-specific API credentials.

        Returns:
            Raw MP3 audio bytes.

        Raises:
            ValueError: If text is empty or too long.
            RuntimeError: If the provider API returns an error.
        """
        ...
```

- [ ] **Step 2: Verify the file is importable**

```bash
cd backend && python -c "from app.services.tts_provider import TTSProvider, TTSKeys; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/tts_provider.py
git commit -m "feat(tts): add TTSProvider protocol and TTSKeys TypedDict"
```

---

### Task 2: Rename tts.py to tts_minimax.py and wrap in MinimaxTTSProvider class

**Files:**
- Rename: `backend/app/services/tts.py` → `backend/app/services/tts_minimax.py`

- [ ] **Step 1: Rename the file and update imports**

```bash
mv backend/app/services/tts.py backend/app/services/tts_minimax.py
```

- [ ] **Step 2: Edit tts_minimax.py to add the MinimaxTTSProvider class**

Replace the entire file content with:

```python
# backend/app/services/tts_minimax.py
"""MiniMax text-to-speech provider."""

import logging

import httpx

from app.config import settings
from app.services.tts_provider import TTSKeys

logger = logging.getLogger(__name__)

_VOICE_ID = "hunyin_6"  # Chinese male voice; adjust if Minimax changes IDs


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
    if not text.strip():
        raise ValueError("text must not be empty")
    if len(text) > 10_000:
        raise ValueError("text exceeds the Minimax limit of 10,000 characters")

    payload = {
        "model": "speech-2.6-turbo",
        "text": text,
        "voice_setting": {
            "voice_id": _VOICE_ID,
            "speed": 0.8,
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

    audio_data = body.get("data", {})
    audio_hex = audio_data.get("audio")
    if not audio_hex:
        raise RuntimeError("Minimax response missing audio data")
    return bytes.fromhex(audio_hex)


class MinimaxTTSProvider:
    """TTSProvider implementation backed by Minimax speech-2.6-turbo."""

    async def synthesize(self, text: str, keys: TTSKeys) -> bytes:
        api_key = keys.get("minimax_api_key", "")
        return await synthesize_speech(text, api_key)
```

- [ ] **Step 3: Verify the file is importable**

```bash
cd backend && python -c "from app.services.tts_minimax import MinimaxTTSProvider; print('OK')"
```
Expected: `OK`

- [ ] **Step 4: Rename the existing test file and update patch paths**

```bash
mv backend/tests/test_tts_service.py backend/tests/test_tts_minimax_service.py
```

Then open `backend/tests/test_tts_minimax_service.py` and replace all occurrences of `app.services.tts` with `app.services.tts_minimax`, and update the import line from `from app.services.tts import synthesize_speech` to `from app.services.tts_minimax import synthesize_speech`.

The updated file should look like:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_synthesize_speech_returns_mp3_bytes():
    """Service decodes hex audio from Minimax response."""
    fake_audio = b"\xff\xfb\x90\x00" * 10
    fake_hex = fake_audio.hex()

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

    with patch("app.services.tts_minimax.httpx.AsyncClient", return_value=mock_client):
        from app.services.tts_minimax import synthesize_speech
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

    with patch("app.services.tts_minimax.httpx.AsyncClient", return_value=mock_client):
        from app.services.tts_minimax import synthesize_speech
        with pytest.raises(RuntimeError, match="Invalid API key"):
            await synthesize_speech("你好", "bad-key")


@pytest.mark.asyncio
async def test_synthesize_speech_rejects_empty_text():
    """Service raises ValueError for empty text."""
    from app.services.tts_minimax import synthesize_speech
    with pytest.raises(ValueError, match="text"):
        await synthesize_speech("", "key")


@pytest.mark.asyncio
async def test_synthesize_speech_rejects_oversized_text():
    """Service raises ValueError for text exceeding 10,000 chars."""
    from app.services.tts_minimax import synthesize_speech
    with pytest.raises(ValueError, match="10,000"):
        await synthesize_speech("a" * 10_001, "key")
```

- [ ] **Step 5: Run MiniMax service tests to confirm they still pass**

```bash
cd backend && python -m pytest tests/test_tts_minimax_service.py -v
```
Expected: 4 tests pass

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/tts_minimax.py backend/tests/test_tts_minimax_service.py
git commit -m "refactor(tts): rename tts.py to tts_minimax.py, wrap in MinimaxTTSProvider"
```

---

### Task 3: Add tts_provider config field

**Files:**
- Modify: `backend/app/config.py`

- [ ] **Step 1: Add tts_provider field to Settings**

In `backend/app/config.py`, add `tts_provider: str = "azure"` after the `minimax_tts_url` line:

```python
# backend/app/config.py
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    max_video_duration_seconds: int = 1200  # 20 minutes
    max_upload_size_bytes: int = 2_147_483_648  # 2 GB
    allowed_video_formats: list[str] = ["mp4", "mkv", "webm", "mov"]
    translation_batch_size: int = 30
    translation_max_retries: int = 2
    openrouter_chat_url: str = "https://openrouter.ai/api/v1/chat/completions"
    openrouter_model: str = "qwen/qwen3.5-122b-a10b"
    minimax_tts_url: str = "https://api.minimax.io/v1/t2a_v2"
    tts_provider: str = "azure"  # env: SHADOWLEARN_TTS_PROVIDER; values: azure | minimax

    model_config = {"env_prefix": "SHADOWLEARN_"}


settings = Settings()
```

- [ ] **Step 2: Verify**

```bash
cd backend && python -c "from app.config import settings; print(settings.tts_provider)"
```
Expected: `azure`

```bash
cd backend && SHADOWLEARN_TTS_PROVIDER=minimax python -c "from app.config import settings; print(settings.tts_provider)"
```
Expected: `minimax`

- [ ] **Step 3: Commit**

```bash
git add backend/app/config.py
git commit -m "feat(config): add tts_provider setting (SHADOWLEARN_TTS_PROVIDER)"
```

---

### Task 4: Create tts_factory.py

**Files:**
- Create: `backend/app/services/tts_factory.py`

- [ ] **Step 1: Create the factory**

```python
# backend/app/services/tts_factory.py
"""Factory: resolves the active TTSProvider from settings."""

from app.config import Settings
from app.services.tts_provider import TTSProvider


def get_tts_provider(settings: Settings) -> TTSProvider:
    """Return the TTSProvider instance configured by settings.tts_provider.

    Args:
        settings: Application settings instance.

    Returns:
        An instance of the configured TTSProvider.

    Raises:
        ValueError: If settings.tts_provider is not a known value.
    """
    provider = settings.tts_provider.lower()

    if provider == "azure":
        from app.services.tts_azure import AzureTTSProvider
        return AzureTTSProvider()

    if provider == "minimax":
        from app.services.tts_minimax import MinimaxTTSProvider
        return MinimaxTTSProvider()

    raise ValueError(
        f"Unknown TTS provider: '{settings.tts_provider}'. "
        "Set SHADOWLEARN_TTS_PROVIDER to 'azure' or 'minimax'."
    )
```

Note: `AzureTTSProvider` is imported lazily inside the function to avoid import errors before `tts_azure.py` exists. Once Task 5 (Chunk 2) is complete, the factory will work end-to-end.

- [ ] **Step 2: Verify factory raises for unknown provider**

```bash
cd backend && python -c "
from app.config import Settings
from app.services.tts_factory import get_tts_provider
s = Settings(tts_provider='bogus')
try:
    get_tts_provider(s)
except ValueError as e:
    print('OK:', e)
"
```
Expected: `OK: Unknown TTS provider: 'bogus'. Set SHADOWLEARN_TTS_PROVIDER to 'azure' or 'minimax'.`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/tts_factory.py
git commit -m "feat(tts): add TTSProvider factory"
```

---

### Task 5: Wire lifespan event in main.py + add conftest fixture

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/tests/conftest.py`

- [ ] **Step 1: Add lifespan to main.py**

Replace `backend/app/main.py` with:

```python
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import chat, jobs, lessons, pronunciation, quiz, tts
from app.services.tts_factory import get_tts_provider

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.tts_provider = get_tts_provider(settings)
    app.state.tts_provider_name = settings.tts_provider
    yield


app = FastAPI(title="ShadowLearn API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(lessons.router)
app.include_router(chat.router)
app.include_router(tts.router)
app.include_router(jobs.router)
app.include_router(quiz.router)
app.include_router(pronunciation.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 2: Add mock_tts_provider fixture to conftest.py**

`backend/tests/conftest.py` is currently empty (one blank line). Replace it with:

```python
import pytest
from unittest.mock import AsyncMock

from app.main import app


@pytest.fixture
def mock_tts_provider():
    """Seed app.state.tts_provider with an AsyncMock for router tests.

    Without this, tests that hit TTS router endpoints will fail with
    AttributeError because the lifespan event doesn't run in test context.
    """
    provider = AsyncMock()
    app.state.tts_provider = provider
    app.state.tts_provider_name = "azure"
    return provider
```

- [ ] **Step 3: Verify app starts without error (with azure provider — tts_azure.py doesn't exist yet so expect ImportError, not ValueError)**

```bash
cd backend && python -c "
from app.config import Settings
from app.services.tts_factory import get_tts_provider
try:
    get_tts_provider(Settings(tts_provider='azure'))
except ImportError as e:
    print('Expected ImportError (tts_azure not yet created):', e)
except ValueError as e:
    print('UNEXPECTED ValueError:', e)
"
```
Expected: `Expected ImportError (tts_azure not yet created): ...`

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py backend/tests/conftest.py
git commit -m "feat(tts): wire lifespan event and add mock_tts_provider test fixture"
```

---

## Chunk 2: Azure TTS Service

Files in this chunk:
- Create: `backend/app/services/tts_azure.py`
- Create: `backend/tests/test_tts_azure_service.py`

---

### Task 6: Implement AzureTTSProvider

**Files:**
- Create: `backend/app/services/tts_azure.py`

- [ ] **Step 1: Write the failing tests first**

Create `backend/tests/test_tts_azure_service.py`:

```python
# backend/tests/test_tts_azure_service.py
"""Tests for AzureTTSProvider."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_azure_synthesize_returns_mp3_bytes():
    """Provider returns raw bytes from Azure on success."""
    fake_mp3 = b"\xff\xfb\x90\x00" * 10

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = fake_mp3
    mock_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = AsyncMock(return_value=mock_response)

    with patch("app.services.tts_azure.httpx.AsyncClient", return_value=mock_client):
        from app.services.tts_azure import AzureTTSProvider
        provider = AzureTTSProvider()
        result = await provider.synthesize("你好", {"azure_speech_key": "key", "azure_speech_region": "eastus"})

    assert result == fake_mp3


@pytest.mark.asyncio
async def test_azure_synthesize_rejects_empty_text():
    """Provider raises ValueError for empty text before making HTTP call."""
    from app.services.tts_azure import AzureTTSProvider
    provider = AzureTTSProvider()
    with pytest.raises(ValueError, match="empty"):
        await provider.synthesize("", {"azure_speech_key": "key", "azure_speech_region": "eastus"})


@pytest.mark.asyncio
async def test_azure_synthesize_rejects_oversized_text():
    """Provider raises ValueError for text exceeding 2,000 chars."""
    from app.services.tts_azure import AzureTTSProvider
    provider = AzureTTSProvider()
    with pytest.raises(ValueError, match="2,000"):
        await provider.synthesize("a" * 2_001, {"azure_speech_key": "key", "azure_speech_region": "eastus"})


@pytest.mark.asyncio
async def test_azure_synthesize_raises_on_401():
    """Provider raises RuntimeError on 401 Unauthorized."""
    import httpx

    mock_response = MagicMock()
    mock_response.status_code = 401
    mock_response.raise_for_status = MagicMock(
        side_effect=httpx.HTTPStatusError("401", request=MagicMock(), response=mock_response)
    )

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = AsyncMock(return_value=mock_response)

    with patch("app.services.tts_azure.httpx.AsyncClient", return_value=mock_client):
        from app.services.tts_azure import AzureTTSProvider
        provider = AzureTTSProvider()
        with pytest.raises(RuntimeError, match="invalid or expired"):
            await provider.synthesize("你好", {"azure_speech_key": "bad", "azure_speech_region": "eastus"})


@pytest.mark.asyncio
async def test_azure_synthesize_raises_on_403():
    """Provider raises RuntimeError on 403 Forbidden (quota/resource error)."""
    import httpx

    mock_response = MagicMock()
    mock_response.status_code = 403
    mock_response.raise_for_status = MagicMock(
        side_effect=httpx.HTTPStatusError("403", request=MagicMock(), response=mock_response)
    )

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = AsyncMock(return_value=mock_response)

    with patch("app.services.tts_azure.httpx.AsyncClient", return_value=mock_client):
        from app.services.tts_azure import AzureTTSProvider
        provider = AzureTTSProvider()
        with pytest.raises(RuntimeError, match="quota"):
            await provider.synthesize("你好", {"azure_speech_key": "key", "azure_speech_region": "eastus"})


@pytest.mark.asyncio
async def test_azure_synthesize_raises_on_429():
    """Provider raises RuntimeError on 429 Too Many Requests."""
    import httpx

    mock_response = MagicMock()
    mock_response.status_code = 429
    mock_response.raise_for_status = MagicMock(
        side_effect=httpx.HTTPStatusError("429", request=MagicMock(), response=mock_response)
    )

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = AsyncMock(return_value=mock_response)

    with patch("app.services.tts_azure.httpx.AsyncClient", return_value=mock_client):
        from app.services.tts_azure import AzureTTSProvider
        provider = AzureTTSProvider()
        with pytest.raises(RuntimeError, match="rate limit"):
            await provider.synthesize("你好", {"azure_speech_key": "key", "azure_speech_region": "eastus"})


@pytest.mark.asyncio
async def test_azure_ssml_escapes_special_characters():
    """XML special characters in text are escaped before SSML interpolation."""
    captured_body = {}

    async def fake_post(url, *, content, headers):
        captured_body["ssml"] = content.decode()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b"\xff\xfb"
        mock_response.raise_for_status = MagicMock()
        return mock_response

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = fake_post

    with patch("app.services.tts_azure.httpx.AsyncClient", return_value=mock_client):
        from app.services.tts_azure import AzureTTSProvider
        provider = AzureTTSProvider()
        await provider.synthesize(
            '<script>alert("xss")</script> & "quote"',
            {"azure_speech_key": "key", "azure_speech_region": "eastus"},
        )

    ssml = captured_body["ssml"]
    assert "<script>" not in ssml
    assert "&lt;script&gt;" in ssml
    assert "&amp;" in ssml
    assert "&quot;" in ssml


@pytest.mark.asyncio
async def test_azure_synthesize_raises_on_400():
    """Provider raises RuntimeError on 400 Bad Request."""
    import httpx

    mock_response = MagicMock()
    mock_response.status_code = 400
    mock_response.raise_for_status = MagicMock(
        side_effect=httpx.HTTPStatusError("400", request=MagicMock(), response=mock_response)
    )

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = AsyncMock(return_value=mock_response)

    with patch("app.services.tts_azure.httpx.AsyncClient", return_value=mock_client):
        from app.services.tts_azure import AzureTTSProvider
        provider = AzureTTSProvider()
        with pytest.raises(RuntimeError, match="HTTP 400"):
            await provider.synthesize("你好", {"azure_speech_key": "key", "azure_speech_region": "eastus"})


@pytest.mark.asyncio
async def test_azure_synthesize_raises_on_network_error():
    """Provider raises RuntimeError on network/connection failure."""
    import httpx

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = AsyncMock(side_effect=httpx.ConnectError("connection refused"))

    with patch("app.services.tts_azure.httpx.AsyncClient", return_value=mock_client):
        from app.services.tts_azure import AzureTTSProvider
        provider = AzureTTSProvider()
        with pytest.raises(Exception):  # ConnectError or wrapped RuntimeError
            await provider.synthesize("你好", {"azure_speech_key": "key", "azure_speech_region": "eastus"})
```

- [ ] **Step 2: Run tests to confirm they all fail (service not yet written)**

```bash
cd backend && python -m pytest tests/test_tts_azure_service.py -v
```
Expected: All tests fail with `ImportError: cannot import name 'AzureTTSProvider'`

- [ ] **Step 3: Implement AzureTTSProvider**

Create `backend/app/services/tts_azure.py`:

```python
# backend/app/services/tts_azure.py
"""Azure Cognitive Services TTS provider."""

import html
import logging

import httpx

from app.services.tts_provider import TTSKeys

logger = logging.getLogger(__name__)

_VOICE = "zh-CN-XiaoxiaoNeural"
_OUTPUT_FORMAT = "audio-16khz-128kbitrate-mono-mp3"
_MAX_TEXT_LENGTH = 2_000  # Azure REST API SSML limit is ~3,000 chars; 2,000 gives safe headroom


def _build_ssml(text: str) -> str:
    escaped = html.escape(text)
    return (
        f"<speak version='1.0' xml:lang='zh-CN'>"
        f"<voice xml:lang='zh-CN' name='{_VOICE}'>{escaped}</voice>"
        f"</speak>"
    )


class AzureTTSProvider:
    """TTSProvider implementation backed by Azure Cognitive Services TTS REST API."""

    async def synthesize(self, text: str, keys: TTSKeys) -> bytes:
        """Synthesize text to MP3 using Azure TTS.

        Args:
            text: Chinese text to synthesize (1–2,000 characters).
            keys: Must contain 'azure_speech_key' and 'azure_speech_region'.

        Returns:
            Raw MP3 bytes.

        Raises:
            ValueError: If text is empty or exceeds 2,000 characters.
            RuntimeError: If Azure returns any HTTP error (4xx/5xx) or a network failure occurs.
        """
        if not text.strip():
            raise ValueError("text must not be empty")
        if len(text) > _MAX_TEXT_LENGTH:
            raise ValueError(f"text exceeds the Azure TTS limit of {_MAX_TEXT_LENGTH:,} characters")

        key = keys.get("azure_speech_key", "")
        region = keys.get("azure_speech_region", "")
        url = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"

        ssml = _build_ssml(text)
        headers = {
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": _OUTPUT_FORMAT,
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, content=ssml.encode("utf-8"), headers=headers)
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if status == 401:
                raise RuntimeError("Azure Speech key invalid or expired") from exc
            if status == 403:
                raise RuntimeError("Azure Speech quota exceeded or resource not found") from exc
            if status == 429:
                raise RuntimeError("Azure Speech rate limit exceeded") from exc
            raise RuntimeError(f"Azure TTS request error (HTTP {status})") from exc

        return response.content
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd backend && python -m pytest tests/test_tts_azure_service.py -v
```
Expected: 9 tests pass

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/tts_azure.py backend/tests/test_tts_azure_service.py
git commit -m "feat(tts): add AzureTTSProvider with SSML generation and error mapping"
```

---

## Chunk 3: Backend Router Updates

Files in this chunk:
- Modify: `backend/app/models.py`
- Modify: `backend/app/routers/tts.py`
- Modify: `backend/tests/test_tts_router.py`

---

### Task 7: Update TTSRequest model

**Files:**
- Modify: `backend/app/models.py`

- [ ] **Step 1: Update TTSRequest**

In `backend/app/models.py`, replace:

```python
class TTSRequest(BaseModel):
    text: str
    minimax_api_key: str
```

with:

```python
class TTSRequest(BaseModel):
    text: str
    minimax_api_key: str | None = None
    azure_speech_key: str | None = None
    azure_speech_region: str | None = None
```

- [ ] **Step 2: Verify**

```bash
cd backend && python -c "
from app.models import TTSRequest
r = TTSRequest(text='hi')
print(r.minimax_api_key, r.azure_speech_key, r.azure_speech_region)
"
```
Expected: `None None None`

- [ ] **Step 3: Commit**

```bash
git add backend/app/models.py
git commit -m "feat(tts): update TTSRequest model for multi-provider key fields"
```

---

### Task 8: Rewrite TTS router with provider endpoint and factory dispatch

**Files:**
- Modify: `backend/app/routers/tts.py`

- [ ] **Step 1: Write failing router tests first**

Replace `backend/tests/test_tts_router.py` entirely:

```python
# backend/tests/test_tts_router.py
"""Tests for TTS router endpoints."""

import pytest
from unittest.mock import AsyncMock
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.mark.asyncio
async def test_get_provider_returns_provider_name(mock_tts_provider):
    """GET /api/tts/provider returns the active provider name."""
    app.state.tts_provider_name = "azure"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/tts/provider")

    assert response.status_code == 200
    assert response.json() == {"provider": "azure"}


@pytest.mark.asyncio
async def test_get_provider_returns_minimax_when_set(mock_tts_provider):
    """GET /api/tts/provider returns 'minimax' when provider is minimax."""
    app.state.tts_provider_name = "minimax"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/tts/provider")

    assert response.status_code == 200
    assert response.json() == {"provider": "minimax"}


@pytest.mark.asyncio
async def test_tts_azure_returns_audio(mock_tts_provider):
    """POST /api/tts with Azure keys returns audio/mpeg."""
    fake_mp3 = b"\xff\xfb\x90\x00" * 10
    mock_tts_provider.synthesize = AsyncMock(return_value=fake_mp3)
    app.state.tts_provider_name = "azure"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/tts",
            json={"text": "你好", "azure_speech_key": "key", "azure_speech_region": "eastus"},
        )

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.content == fake_mp3


@pytest.mark.asyncio
async def test_tts_azure_returns_400_when_keys_missing(mock_tts_provider):
    """POST /api/tts returns 400 when Azure keys are absent and provider is azure."""
    app.state.tts_provider_name = "azure"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/tts",
            json={"text": "你好"},
        )

    assert response.status_code == 400
    assert "Azure" in response.json()["detail"]


@pytest.mark.asyncio
async def test_tts_minimax_returns_audio(mock_tts_provider):
    """POST /api/tts with MiniMax key returns audio/mpeg."""
    fake_mp3 = b"\xff\xfb\x90\x00" * 10
    mock_tts_provider.synthesize = AsyncMock(return_value=fake_mp3)
    app.state.tts_provider_name = "minimax"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/tts",
            json={"text": "你好", "minimax_api_key": "test-key"},
        )

    assert response.status_code == 200
    assert response.content == fake_mp3


@pytest.mark.asyncio
async def test_tts_minimax_returns_400_when_key_missing(mock_tts_provider):
    """POST /api/tts returns 400 when MiniMax key is absent and provider is minimax."""
    app.state.tts_provider_name = "minimax"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/tts",
            json={"text": "你好"},
        )

    assert response.status_code == 400
    assert "MiniMax" in response.json()["detail"]


@pytest.mark.asyncio
async def test_tts_rejects_empty_text(mock_tts_provider):
    """POST /api/tts returns 400 when text is empty (text validated before keys)."""
    app.state.tts_provider_name = "azure"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/tts",
            json={"text": "", "azure_speech_key": "key", "azure_speech_region": "eastus"},
        )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_tts_rejects_oversized_text(mock_tts_provider):
    """POST /api/tts returns 400 when text exceeds 2,000 chars."""
    app.state.tts_provider_name = "azure"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/tts",
            json={"text": "a" * 2_001, "azure_speech_key": "key", "azure_speech_region": "eastus"},
        )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_tts_returns_502_on_provider_error(mock_tts_provider):
    """POST /api/tts returns 502 when provider raises RuntimeError."""
    mock_tts_provider.synthesize = AsyncMock(side_effect=RuntimeError("Azure key invalid"))
    app.state.tts_provider_name = "azure"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/tts",
            json={"text": "你好", "azure_speech_key": "bad", "azure_speech_region": "eastus"},
        )

    assert response.status_code == 502
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && python -m pytest tests/test_tts_router.py -v
```
Expected: Most tests fail (router still calls old `synthesize_speech`, no `/api/tts/provider` endpoint)

- [ ] **Step 3: Rewrite the TTS router**

Replace `backend/app/routers/tts.py` entirely:

```python
# backend/app/routers/tts.py
"""TTS router: provider discovery and text-to-speech proxy."""

import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from app.models import TTSRequest
from app.services.tts_provider import TTSKeys

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


@router.get("/tts/provider")
async def get_tts_provider(request: Request) -> dict:
    """Return the name of the currently active TTS provider."""
    return {"provider": request.app.state.tts_provider_name}


@router.post("/tts")
async def text_to_speech(body: TTSRequest, request: Request) -> Response:
    """Convert text to speech via the active provider and return MP3 audio bytes.

    Validation order:
      1. Text validation (empty / too long) — 400
      2. Key validation for active provider — 400
      3. Synthesize — 502 on provider error
    """
    provider_name = request.app.state.tts_provider_name

    # Step 1: text validation (provider-agnostic; raises ValueError → 400)
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Text is required")
    if len(body.text) > 2_000:
        raise HTTPException(status_code=400, detail="Text too long (max 2,000 characters)")

    # Step 2: key validation
    keys: TTSKeys = {}
    if provider_name == "azure":
        if not body.azure_speech_key or not body.azure_speech_region:
            raise HTTPException(
                status_code=400,
                detail="Azure Speech key and region required",
            )
        keys = {
            "azure_speech_key": body.azure_speech_key,
            "azure_speech_region": body.azure_speech_region,
        }
    elif provider_name == "minimax":
        if not body.minimax_api_key:
            raise HTTPException(status_code=400, detail="MiniMax API key required")
        keys = {"minimax_api_key": body.minimax_api_key}

    # Step 3: synthesize
    try:
        audio_bytes = await request.app.state.tts_provider.synthesize(body.text, keys)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("TTS synthesis failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))

    return Response(content=audio_bytes, media_type="audio/mpeg")
```

- [ ] **Step 4: Run all router tests — all should pass**

```bash
cd backend && python -m pytest tests/test_tts_router.py -v
```
Expected: 9 tests pass

- [ ] **Step 5: Run the full backend test suite**

```bash
cd backend && python -m pytest -v
```
Expected: All tests pass (no regressions)

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/tts.py backend/tests/test_tts_router.py
git commit -m "feat(tts): add /api/tts/provider endpoint, route to active TTSProvider"
```

---

## Chunk 4: Frontend

Files in this chunk:
- Modify: `frontend/src/hooks/useTTS.ts`
- Modify: `frontend/src/components/onboarding/Setup.tsx`
- Modify: `frontend/src/components/settings/Settings.tsx`
- Modify: `frontend/tests/useTTS.test.ts`

---

### Task 9: Update useTTS hook

**Files:**
- Modify: `frontend/src/hooks/useTTS.ts`

- [ ] **Step 1: Write the failing tests first**

Replace `frontend/tests/useTTS.test.ts` entirely:

```typescript
import { act, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getTTSCache, saveTTSCache } from '../src/db'
import { useTTS } from '../src/hooks/useTTS'

vi.mock('../src/db', () => ({
  getTTSCache: vi.fn(),
  saveTTSCache: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const mockDb = {} as any
const mockKeys = { openrouterApiKey: 'sk-test', minimaxApiKey: 'mm-test', azureSpeechKey: 'az-key', azureSpeechRegion: 'eastus' }

function mockProviderFetch(provider: string) {
  vi.mocked(globalThis.fetch).mockImplementation(async (url: any) => {
    if (String(url).includes('/api/tts/provider')) {
      return { ok: true, json: () => Promise.resolve({ provider }) } as any
    }
    return { ok: false, statusText: 'Not Found' } as any
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.fetch = vi.fn()
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  globalThis.URL.revokeObjectURL = vi.fn()
})

describe('useTTS', () => {
  it('returns loadingText null initially', () => {
    mockProviderFetch('azure')
    const { result } = renderHook(() => useTTS(mockDb, mockKeys))
    expect(result.current.loadingText).toBeNull()
  })

  it('is a no-op while provider is still loading (null)', async () => {
    // Never resolve the provider fetch
    vi.mocked(globalThis.fetch).mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useTTS(mockDb, mockKeys))

    await act(async () => {
      await result.current.playTTS('你好')
    })

    expect(toast.error).not.toHaveBeenCalled()
    expect(getTTSCache).not.toHaveBeenCalled()
  })

  it('defaults to azure when provider fetch fails', async () => {
    vi.mocked(globalThis.fetch).mockImplementation(async (url: any) => {
      if (String(url).includes('/api/tts/provider')) {
        return { ok: false, statusText: 'Internal Server Error' } as any
      }
      return { ok: false, statusText: 'Not Found' } as any
    })
    const { result } = renderHook(() => useTTS(mockDb, mockKeys))

    // Wait for provider to resolve (to 'azure' fallback)
    await waitFor(() => expect(result.current.loadingText).toBeNull())

    // No error toast for the provider fetch failure
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('shows Azure error toast when azure_speech_key is missing and provider is azure', async () => {
    mockProviderFetch('azure')
    const keysWithoutAzure = { openrouterApiKey: 'sk-test' }
    const { result } = renderHook(() => useTTS(mockDb, keysWithoutAzure as any))

    await waitFor(() => {}) // let provider fetch settle

    await act(async () => {
      await result.current.playTTS('你好')
    })

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Azure'))
    expect(getTTSCache).not.toHaveBeenCalled()
  })

  it('shows MiniMax error toast when minimaxApiKey is missing and provider is minimax', async () => {
    mockProviderFetch('minimax')
    const keysWithoutMinimax = { openrouterApiKey: 'sk-test' }
    const { result } = renderHook(() => useTTS(mockDb, keysWithoutMinimax as any))

    await waitFor(() => {}) // let provider fetch settle

    await act(async () => {
      await result.current.playTTS('你好')
    })

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('MiniMax'))
    expect(getTTSCache).not.toHaveBeenCalled()
  })

  it('plays from cache without calling fetch for audio (azure provider)', async () => {
    mockProviderFetch('azure')
    const fakeBlob = new Blob([new Uint8Array([0xFF, 0xFB])], { type: 'audio/mpeg' })
    vi.mocked(getTTSCache).mockResolvedValueOnce(fakeBlob)

    const { result } = renderHook(() => useTTS(mockDb, mockKeys))
    await waitFor(() => {}) // let provider fetch settle

    vi.mocked(globalThis.fetch).mockClear() // clear provider fetch call count

    await act(async () => {
      await result.current.playTTS('你好')
    })

    expect(getTTSCache).toHaveBeenCalledWith(mockDb, '你好')
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(saveTTSCache).not.toHaveBeenCalled()
  })

  it('fetches from API with Azure keys on cache miss', async () => {
    mockProviderFetch('azure')
    vi.mocked(getTTSCache).mockResolvedValueOnce(undefined)
    const fakeBlob = new Blob([new Uint8Array([0xFF, 0xFB])], { type: 'audio/mpeg' })

    vi.mocked(globalThis.fetch).mockImplementation(async (url: any) => {
      if (String(url).includes('/api/tts/provider')) {
        return { ok: true, json: () => Promise.resolve({ provider: 'azure' }) } as any
      }
      return { ok: true, blob: () => Promise.resolve(fakeBlob) } as any
    })

    const { result } = renderHook(() => useTTS(mockDb, mockKeys))
    await waitFor(() => {}) // let provider fetch settle

    await act(async () => {
      await result.current.playTTS('你好')
    })

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/tts', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ text: '你好', azure_speech_key: 'az-key', azure_speech_region: 'eastus' }),
    }))
    expect(saveTTSCache).toHaveBeenCalledWith(mockDb, '你好', fakeBlob)
  })

  it('fetches from API with MiniMax key on cache miss', async () => {
    mockProviderFetch('minimax')
    vi.mocked(getTTSCache).mockResolvedValueOnce(undefined)
    const fakeBlob = new Blob([new Uint8Array([0xFF, 0xFB])], { type: 'audio/mpeg' })

    vi.mocked(globalThis.fetch).mockImplementation(async (url: any) => {
      if (String(url).includes('/api/tts/provider')) {
        return { ok: true, json: () => Promise.resolve({ provider: 'minimax' }) } as any
      }
      return { ok: true, blob: () => Promise.resolve(fakeBlob) } as any
    })

    const { result } = renderHook(() => useTTS(mockDb, mockKeys))
    await waitFor(() => {}) // let provider fetch settle

    await act(async () => {
      await result.current.playTTS('你好')
    })

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/tts', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ text: '你好', minimax_api_key: 'mm-test' }),
    }))
  })

  it('is a no-op for empty text', async () => {
    mockProviderFetch('azure')
    const { result } = renderHook(() => useTTS(mockDb, mockKeys))
    await waitFor(() => {})

    await act(async () => {
      await result.current.playTTS('')
    })

    expect(getTTSCache).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run tests/useTTS.test.ts
```
Expected: Most tests fail — hook still uses MiniMax-only logic

- [ ] **Step 3: Rewrite useTTS hook**

Replace `frontend/src/hooks/useTTS.ts` entirely:

```typescript
import type { ShadowLearnDB } from '@/db'
import type { DecryptedKeys } from '@/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { getTTSCache, saveTTSCache } from '@/db'

interface UseTTSReturn {
  playTTS: (text: string) => Promise<void>
  loadingText: string | null
}

export function useTTS(
  db: ShadowLearnDB | null,
  keys: DecryptedKeys | null,
): UseTTSReturn {
  const [loadingText, setLoadingText] = useState<string | null>(null)
  const [provider, setProvider] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  // Fetch the active provider once on mount
  useEffect(() => {
    fetch('/api/tts/provider')
      .then((res) => {
        if (!res.ok)
          throw new Error('provider fetch failed')
        return res.json()
      })
      .then((data: { provider: string }) => setProvider(data.provider))
      .catch(() => {
        // Silently default to azure on failure
        console.warn('[useTTS] Failed to fetch TTS provider, defaulting to azure')
        setProvider('azure')
      })
  }, [])

  const playTTS = useCallback(async (text: string) => {
    if (!text)
      return

    // No-op while provider is still loading
    if (provider === null)
      return

    // Key validation per provider
    if (provider === 'azure') {
      if (!keys?.azureSpeechKey || !keys?.azureSpeechRegion) {
        toast.error('Add your Azure Speech key in Settings to use pronunciation')
        return
      }
    }
    else if (provider === 'minimax') {
      if (!keys?.minimaxApiKey) {
        toast.error('Add your MiniMax API key in Settings to use pronunciation')
        return
      }
    }

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }

    setLoadingText(text)

    try {
      let blob: Blob | undefined

      if (db) {
        blob = await getTTSCache(db, text)
      }

      if (!blob) {
        // Build request body based on active provider
        const body: Record<string, string> = { text }
        if (provider === 'azure') {
          body.azure_speech_key = keys!.azureSpeechKey!
          body.azure_speech_region = keys!.azureSpeechRegion!
        }
        else if (provider === 'minimax') {
          body.minimax_api_key = keys!.minimaxApiKey!
        }

        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          throw new Error(`TTS failed: ${response.statusText}`)
        }

        blob = await response.blob()

        if (db) {
          await saveTTSCache(db, text, blob)
        }
      }

      const url = URL.createObjectURL(blob)
      urlRef.current = url
      const audio = new Audio(url)
      audioRef.current = audio

      audio.addEventListener('ended', () => {
        URL.revokeObjectURL(url)
        urlRef.current = null
      })
      audio.play().catch(() => {})
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : 'Pronunciation failed'
      toast.error(msg)
    }
    finally {
      setLoadingText(null)
    }
  }, [db, keys, provider])

  return { playTTS, loadingText }
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd frontend && npx vitest run tests/useTTS.test.ts
```
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useTTS.ts frontend/tests/useTTS.test.ts
git commit -m "feat(tts): update useTTS hook for multi-provider support (azure/minimax)"
```

---

### Task 10: Update Setup.tsx for provider-aware key fields

**Files:**
- Modify: `frontend/src/components/onboarding/Setup.tsx`

- [ ] **Step 1: Add provider fetch and conditional rendering**

Replace `frontend/src/components/onboarding/Setup.tsx` entirely:

```tsx
import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'

export function Setup() {
  const { setup } = useAuth()

  const [provider, setProvider] = useState<string | null>(null)
  const [openrouterApiKey, setOpenrouterApiKey] = useState('')
  const [minimaxApiKey, setMinimaxApiKey] = useState('')
  const [deepgramApiKey, setDeepgramApiKey] = useState('')
  const [azureSpeechKey, setAzureSpeechKey] = useState('')
  const [azureSpeechRegion, setAzureSpeechRegion] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/tts/provider')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then((data: { provider: string }) => setProvider(data.provider))
      .catch(() => setProvider('azure'))
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!openrouterApiKey.trim()) {
      setError('OpenRouter API key is required.')
      return
    }
    if (!deepgramApiKey.trim()) {
      setError('Deepgram API key is required.')
      return
    }
    if (provider === 'azure') {
      if (!azureSpeechKey.trim() || !azureSpeechRegion.trim()) {
        setError('Azure Speech key and region are required for pronunciation.')
        return
      }
    }
    if (provider === 'minimax') {
      if (!minimaxApiKey.trim()) {
        setError('MiniMax API key is required for pronunciation.')
        return
      }
    }
    if (pin.length < 4) {
      setError('PIN must be at least 4 characters.')
      return
    }
    if (pin !== pinConfirm) {
      setError('PINs do not match.')
      return
    }

    try {
      setLoading(true)
      await setup(
        {
          openrouterApiKey: openrouterApiKey.trim(),
          minimaxApiKey: minimaxApiKey.trim() || undefined,
          deepgramApiKey: deepgramApiKey.trim() || undefined,
          azureSpeechKey: azureSpeechKey.trim() || undefined,
          azureSpeechRegion: azureSpeechRegion.trim() || undefined,
        },
        pin,
      )
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : 'Setup failed.'
      setError(msg)
      toast.error(msg)
    }
    finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[oklch(0.08_0_0)] px-4">
      <Card className="w-full max-w-md bg-white/6 text-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Welcome to ShadowLearn</CardTitle>
          <CardDescription className="text-white/40">
            Enter your API keys to get started. They will be encrypted with your PIN and stored
            locally in your browser — nothing leaves this device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="openai" className="text-sm font-medium text-white/65">
                OpenRouter API Key
              </label>
              <Input
                id="openai"
                type="password"
                placeholder="sk-..."
                value={openrouterApiKey}
                onChange={e => setOpenrouterApiKey(e.target.value)}
              />
              <p className="text-sm text-white/30">
                Used for translation and AI chat.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="deepgram" className="text-sm font-medium text-white/65">
                Deepgram API Key
              </label>
              <Input
                id="deepgram"
                type="password"
                placeholder="dg-..."
                value={deepgramApiKey}
                onChange={e => setDeepgramApiKey(e.target.value)}
              />
              <p className="text-sm text-white/30">
                Used for transcription. Required to create lessons.
              </p>
            </div>

            {/* Azure TTS fields — shown when provider is 'azure' (or still loading, as safe default) */}
            {(provider === null || provider === 'azure') && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="azure-speech-key" className="text-sm font-medium text-white/65">
                    Azure Speech Key
                  </label>
                  <Input
                    id="azure-speech-key"
                    type="password"
                    placeholder="Paste your Azure Speech key…"
                    value={azureSpeechKey}
                    onChange={e => setAzureSpeechKey(e.target.value)}
                  />
                  <p className="text-sm text-white/30">
                    Used for word and sentence pronunciation (TTS) and pronunciation assessment.
                    Free tier: 500K characters/month.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="azure-speech-region" className="text-sm font-medium text-white/65">
                    Azure Speech Region
                  </label>
                  <Input
                    id="azure-speech-region"
                    type="text"
                    placeholder="e.g. eastus"
                    value={azureSpeechRegion}
                    onChange={e => setAzureSpeechRegion(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* MiniMax TTS field — shown only when provider is 'minimax' */}
            {provider === 'minimax' && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="minimax" className="text-sm font-medium text-white/65">
                  Minimax API Key
                </label>
                <Input
                  id="minimax"
                  type="password"
                  placeholder="eyJ..."
                  value={minimaxApiKey}
                  onChange={e => setMinimaxApiKey(e.target.value)}
                />
                <p className="text-sm text-white/30">
                  Used for word and sentence pronunciation (TTS).
                </p>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="pin" className="text-sm font-medium text-white/65">
                PIN (4+ characters)
              </label>
              <Input
                id="pin"
                type="password"
                placeholder="Enter a PIN"
                value={pin}
                onChange={e => setPin(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="pin-confirm" className="text-sm font-medium text-white/65">
                Confirm PIN
              </label>
              <Input
                id="pin-confirm"
                type="password"
                placeholder="Re-enter your PIN"
                value={pinConfirm}
                onChange={e => setPinConfirm(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <Button type="submit" disabled={loading || provider === null} className="mt-1">
              {loading ? 'Setting up...' : 'Get Started'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Verify the component compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/onboarding/Setup.tsx
git commit -m "feat(setup): show TTS key fields based on active provider"
```

---

### Task 11: Update Settings.tsx for provider-aware key fields

**Files:**
- Modify: `frontend/src/components/settings/Settings.tsx`

- [ ] **Step 1: Add provider fetch and conditional key sections**

In `Settings.tsx`, add provider state after the existing state declarations and a `useEffect` to fetch it. Then wrap the MiniMax and Azure key sections conditionally.

The key changes are:
1. Add `const [provider, setProvider] = useState<string | null>(null)` with the other state vars
2. Add a `useEffect` to fetch `/api/tts/provider`
3. Wrap the MiniMax key `<div>` in `{provider === 'minimax' && (...)}`
4. Wrap the Azure key fields in `{(provider === null || provider === 'azure') && (...)}`
5. In `handleSaveKeys`, add validation: if `provider === 'azure'`, require `editAzureSpeechKey` and `editAzureSpeechRegion`; if `provider === 'minimax'`, require `editMinimaxKey`
6. Update the Azure key label from "(for pronunciation assessment)" to "(for TTS and pronunciation assessment)"

Replace `frontend/src/components/settings/Settings.tsx` entirely with:

```tsx
import { Eye, EyeOff, Lock, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { decryptKeys, encryptKeys } from '@/crypto'
import { getCryptoData, getSettings, saveCryptoData, saveSettings } from '@/db'
import { LANGUAGES } from '@/lib/constants'

export function Settings() {
  const { db, keys, lock, resetKeys, setup } = useAuth()

  const [provider, setProvider] = useState<string | null>(null)
  const [language, setLanguage] = useState('en')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinSuccess, setPinSuccess] = useState(false)
  const [showKeys, setShowKeys] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editOpenrouterKey, setEditOpenrouterKey] = useState(keys?.openrouterApiKey ?? '')
  const [editMinimaxKey, setEditMinimaxKey] = useState(keys?.minimaxApiKey ?? '')
  const [editDeepgramKey, setEditDeepgramKey] = useState(keys?.deepgramApiKey ?? '')
  const [editAzureSpeechKey, setEditAzureSpeechKey] = useState(keys?.azureSpeechKey ?? '')
  const [editAzureSpeechRegion, setEditAzureSpeechRegion] = useState(keys?.azureSpeechRegion ?? '')
  const [keysPin, setKeysPin] = useState('')
  const [keysSaved, setKeysSaved] = useState(false)
  const [keysError, setKeysError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/tts/provider')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then((data: { provider: string }) => setProvider(data.provider))
      .catch(() => setProvider('azure'))
  }, [])

  useEffect(() => {
    if (!db)
      return
    getSettings(db).then((s) => {
      if (s) {
        setLanguage(s.translationLanguage)
      }
    })
  }, [db])

  useEffect(() => {
    setEditOpenrouterKey(keys?.openrouterApiKey ?? '')
    setEditMinimaxKey(keys?.minimaxApiKey ?? '')
    setEditDeepgramKey(keys?.deepgramApiKey ?? '')
    setEditAzureSpeechKey(keys?.azureSpeechKey ?? '')
    setEditAzureSpeechRegion(keys?.azureSpeechRegion ?? '')
  }, [keys])

  async function handleSaveKeys() {
    setKeysError(null)
    if (!keysPin) {
      setKeysError('Enter your PIN to save key changes')
      return
    }
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
    if (!db)
      return
    try {
      const cryptoData = await getCryptoData(db)
      if (!cryptoData)
        throw new Error('No stored keys found')
      await decryptKeys(cryptoData, keysPin)

      const newKeys = {
        openrouterApiKey: editOpenrouterKey.trim(),
        minimaxApiKey: editMinimaxKey.trim() || undefined,
        deepgramApiKey: editDeepgramKey.trim() || undefined,
        azureSpeechKey: editAzureSpeechKey.trim() || undefined,
        azureSpeechRegion: editAzureSpeechRegion.trim() || undefined,
      }
      await setup(newKeys, keysPin)
      setKeysSaved(true)
      setKeysPin('')
      toast.success('API keys updated')
      setTimeout(setKeysSaved, 2000, false)
    }
    catch {
      setKeysError('Incorrect PIN or save failed')
      toast.error('Failed to save API keys')
    }
  }

  async function handleChangePin() {
    if (!db || !keys)
      return
    setPinError(null)
    setPinSuccess(false)

    if (newPin.length < 4) {
      setPinError('PIN must be at least 4 characters')
      return
    }
    if (newPin !== confirmPin) {
      setPinError('PINs do not match')
      return
    }

    try {
      const encrypted = await encryptKeys(keys, newPin)
      await saveCryptoData(db, encrypted)
      setNewPin('')
      setConfirmPin('')
      setPinSuccess(true)
      toast.success('PIN changed successfully')
    }
    catch {
      setPinError('Failed to change PIN')
      toast.error('Failed to change PIN')
    }
  }

  async function handleSaveSettings() {
    if (!db)
      return
    await saveSettings(db, {
      translationLanguage: language,
    })
    setSaved(true)
    toast.success('Settings saved')
    setTimeout(setSaved, 2000, false)
  }

  return (
    <Layout>
      <div className="mx-auto max-w-2xl space-y-6 p-4">
        <h1 className="text-xl font-bold">Settings</h1>

        <Card>
          <CardHeader>
            <CardTitle>API Keys</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/40">Visibility</span>
              <Button variant="ghost" size="icon-sm" onClick={() => setShowKeys(!showKeys)}>
                {showKeys ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/40">OpenRouter API Key</label>
              <Input
                type={showKeys ? 'text' : 'password'}
                value={editOpenrouterKey}
                onChange={e => setEditOpenrouterKey(e.target.value)}
                className="font-mono text-sm"
              />
            </div>

            {/* Azure TTS + pronunciation keys — shown when provider is azure (or loading) */}
            {(provider === null || provider === 'azure') && (
              <>
                <div className="space-y-2">
                  <label className="text-sm text-white/40">
                    Azure Speech Key
                    {' '}
                    <span className="text-white/20">(for TTS and pronunciation assessment)</span>
                  </label>
                  <Input
                    type={showKeys ? 'text' : 'password'}
                    value={editAzureSpeechKey}
                    onChange={e => setEditAzureSpeechKey(e.target.value)}
                    className="font-mono text-sm"
                    placeholder="Paste your Azure Speech key"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-white/40">
                    Azure Speech Region
                    {' '}
                    <span className="text-white/20">(e.g. eastus)</span>
                  </label>
                  <Input
                    type={showKeys ? 'text' : 'password'}
                    value={editAzureSpeechRegion}
                    onChange={e => setEditAzureSpeechRegion(e.target.value)}
                    className="font-mono text-sm"
                    placeholder="e.g. eastus"
                  />
                </div>
              </>
            )}

            {/* MiniMax key — shown only when provider is minimax */}
            {provider === 'minimax' && (
              <div className="space-y-2">
                <label className="text-sm text-white/40">
                  Minimax API Key
                  {' '}
                  <span className="text-white/20">(for listening practice)</span>
                </label>
                <Input
                  type={showKeys ? 'text' : 'password'}
                  value={editMinimaxKey}
                  onChange={e => setEditMinimaxKey(e.target.value)}
                  className="font-mono text-sm"
                  placeholder="Leave blank to disable TTS"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm text-white/40">
                Deepgram API Key
                {' '}
                <span className="text-white/20">(for video subtitles)</span>
              </label>
              <Input
                type={showKeys ? 'text' : 'password'}
                value={editDeepgramKey}
                onChange={e => setEditDeepgramKey(e.target.value)}
                className="font-mono text-sm"
                placeholder="dg-..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/40">Confirm with PIN</label>
              <Input
                type="password"
                value={keysPin}
                onChange={e => setKeysPin(e.target.value)}
                placeholder="Enter your PIN to save"
              />
            </div>
            {keysError && <p className="text-sm text-destructive">{keysError}</p>}
            {keysSaved && <p className="text-sm text-emerald-400">Keys saved</p>}
            <Button onClick={handleSaveKeys}>Save Keys</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change PIN</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm text-white/40">New PIN</label>
              <Input
                type="password"
                value={newPin}
                onChange={e => setNewPin(e.target.value)}
                placeholder="Enter new PIN"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/40">Confirm PIN</label>
              <Input
                type="password"
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value)}
                placeholder="Confirm new PIN"
              />
            </div>
            {pinError && <p className="text-sm text-destructive">{pinError}</p>}
            {pinSuccess && <p className="text-sm text-emerald-400">PIN changed successfully</p>}
            <div className="flex gap-2">
              <Button onClick={handleChangePin} size="sm">Change PIN</Button>
              <Button variant="destructive" size="sm" onClick={resetKeys}>
                Forgot PIN
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Language</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <label className="text-sm text-white/40">Translation Language</label>
              <Select value={language} onValueChange={v => v !== null && setLanguage(v)} items={LANGUAGES}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(l => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button onClick={handleSaveSettings}>
            <Save className="size-4" />
            {saved ? 'Saved!' : 'Save Settings'}
          </Button>
          <Button variant="outline" onClick={lock}>
            <Lock className="size-4" />
            Lock App
          </Button>
        </div>
      </div>
    </Layout>
  )
}
```

- [ ] **Step 2: Verify the component compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: No TypeScript errors

- [ ] **Step 3: Run the full frontend test suite**

```bash
cd frontend && npx vitest run
```
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/settings/Settings.tsx
git commit -m "feat(settings): show TTS key fields based on active provider"
```

---

### Final Verification

- [ ] **Step 1: Run the complete backend test suite**

```bash
cd backend && python -m pytest -v
```
Expected: All tests pass

- [ ] **Step 2: Run the complete frontend test suite**

```bash
cd frontend && npx vitest run
```
Expected: All tests pass

- [ ] **Step 3: Smoke test — start the backend and confirm the provider endpoint responds**

```bash
cd backend && uvicorn app.main:app --reload &
sleep 2
curl -s http://localhost:8000/api/tts/provider
```
Expected: `{"provider":"azure"}`

```bash
curl -s http://localhost:8000/api/tts/provider  # with env override
# stop server, restart with SHADOWLEARN_TTS_PROVIDER=minimax
SHADOWLEARN_TTS_PROVIDER=minimax uvicorn app.main:app --port 8001 &
sleep 2
curl -s http://localhost:8001/api/tts/provider
```
Expected: `{"provider":"minimax"}`

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(tts): complete Azure TTS migration with provider abstraction"
```
