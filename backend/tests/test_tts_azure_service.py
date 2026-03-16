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
        with pytest.raises(RuntimeError):
            await provider.synthesize("你好", {"azure_speech_key": "key", "azure_speech_region": "eastus"})
