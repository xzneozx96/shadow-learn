import httpx
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_synthesize_speech_returns_mp3_bytes():
    """Service decodes hex audio from Minimax response."""
    fake_audio = b"\xff\xfb\x90\x00" * 10  # minimal fake mp3 bytes
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


@pytest.mark.asyncio
async def test_synthesize_speech_retries_on_429_then_succeeds():
    """Service retries on 429 and returns bytes on subsequent success."""
    fake_audio = b"\xff\xfb\x90\x00" * 10
    fake_hex = fake_audio.hex()

    ok_response = MagicMock()
    ok_response.status_code = 200
    ok_response.raise_for_status = MagicMock()
    ok_response.json.return_value = {
        "data": {"audio": fake_hex},
        "base_resp": {"status_code": 0, "status_msg": "success"},
    }

    rate_limit_response = MagicMock()
    rate_limit_response.status_code = 429
    rate_limit_response.raise_for_status = MagicMock(
        side_effect=httpx.HTTPStatusError("429", request=MagicMock(), response=rate_limit_response)
    )

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = AsyncMock(side_effect=[rate_limit_response, ok_response])

    with patch("app.services.tts_minimax.httpx.AsyncClient", return_value=mock_client):
        with patch("asyncio.sleep", new_callable=AsyncMock):
            from app.services.tts_minimax import synthesize_speech
            result = await synthesize_speech("你好", "key")

    assert result == fake_audio
    assert mock_client.post.call_count == 2


@pytest.mark.asyncio
async def test_minimax_provider_uses_japanese_voice_for_japanese():
    """MinimaxTTSProvider picks a Japanese_* voice when language starts with 'ja'."""
    captured = {}

    async def fake_post(url, *, json, headers):
        captured["voice_id"] = json["voice_setting"]["voice_id"]
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "data": {"audio": (b"\xff\xfb" * 5).hex()},
            "base_resp": {"status_code": 0, "status_msg": "success"},
        }
        return mock_response

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = fake_post

    with patch("app.services.tts_minimax.httpx.AsyncClient", return_value=mock_client):
        from app.services.tts_minimax import MinimaxTTSProvider
        provider = MinimaxTTSProvider()
        await provider.synthesize("こんにちは", {"minimax_api_key": "key"}, language="ja")

    assert "Japanese" in captured["voice_id"]


@pytest.mark.asyncio
async def test_minimax_provider_uses_chinese_voice_for_chinese():
    """MinimaxTTSProvider uses the default Chinese voice when language starts with 'zh'."""
    captured = {}

    async def fake_post(url, *, json, headers):
        captured["voice_id"] = json["voice_setting"]["voice_id"]
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "data": {"audio": (b"\xff\xfb" * 5).hex()},
            "base_resp": {"status_code": 0, "status_msg": "success"},
        }
        return mock_response

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = fake_post

    with patch("app.services.tts_minimax.httpx.AsyncClient", return_value=mock_client):
        from app.services.tts_minimax import MinimaxTTSProvider
        provider = MinimaxTTSProvider()
        await provider.synthesize("你好", {"minimax_api_key": "key"}, language="zh-CN")

    assert "Japanese" not in captured["voice_id"]
