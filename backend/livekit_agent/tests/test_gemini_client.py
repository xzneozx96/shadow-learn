"""Tests for gemini_client.call_gemini — the offshore -> Google outbound call."""
import os
import sys
from unittest.mock import AsyncMock, patch

import httpx
import pytest
import respx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from _retry import RetryableError
from gemini_client import GEMINI_URL, call_gemini
from schemas import GenerateContentRequest


def _make_request(prompt: str = "hello", key: str = "k1") -> GenerateContentRequest:
    return GenerateContentRequest(prompt=prompt, google_key=key)


@respx.mock
async def test_returns_text_on_success():
    route = respx.post(GEMINI_URL).mock(
        return_value=httpx.Response(
            200,
            json={"candidates": [{"content": {"parts": [{"text": "hi"}]}}]},
        )
    )
    async with httpx.AsyncClient() as client:
        resp = await call_gemini(_make_request(), client=client)
    assert resp.text == "hi"
    assert route.call_count == 1


@respx.mock
async def test_passes_google_key_header():
    captured = {}

    def _capture(request):
        captured["key"] = request.headers.get("x-goog-api-key")
        return httpx.Response(
            200,
            json={"candidates": [{"content": {"parts": [{"text": "ok"}]}}]},
        )

    respx.post(GEMINI_URL).mock(side_effect=_capture)
    async with httpx.AsyncClient() as client:
        await call_gemini(_make_request(key="my-secret"), client=client)
    assert captured["key"] == "my-secret"


@respx.mock
async def test_retries_on_503_then_succeeds():
    route = respx.post(GEMINI_URL).mock(
        side_effect=[
            httpx.Response(503),
            httpx.Response(
                200,
                json={"candidates": [{"content": {"parts": [{"text": "ok"}]}}]},
            ),
        ]
    )
    with patch("asyncio.sleep", new_callable=AsyncMock):
        async with httpx.AsyncClient() as client:
            resp = await call_gemini(_make_request(), client=client)
    assert resp.text == "ok"
    assert route.call_count == 2


@respx.mock
async def test_exhausts_retries_on_persistent_503():
    route = respx.post(GEMINI_URL).mock(return_value=httpx.Response(503))
    with patch("asyncio.sleep", new_callable=AsyncMock):
        async with httpx.AsyncClient() as client:
            with pytest.raises(httpx.HTTPStatusError):
                await call_gemini(_make_request(), client=client)
    assert route.call_count == 3


@respx.mock
async def test_retries_on_429():
    route = respx.post(GEMINI_URL).mock(
        side_effect=[
            httpx.Response(429),
            httpx.Response(
                200,
                json={"candidates": [{"content": {"parts": [{"text": "ok"}]}}]},
            ),
        ]
    )
    with patch("asyncio.sleep", new_callable=AsyncMock):
        async with httpx.AsyncClient() as client:
            resp = await call_gemini(_make_request(), client=client)
    assert resp.text == "ok"
    assert route.call_count == 2


@respx.mock
async def test_does_not_retry_on_401():
    route = respx.post(GEMINI_URL).mock(return_value=httpx.Response(401))
    with patch("asyncio.sleep", new_callable=AsyncMock):
        async with httpx.AsyncClient() as client:
            with pytest.raises(httpx.HTTPStatusError):
                await call_gemini(_make_request(), client=client)
    assert route.call_count == 1


@respx.mock
async def test_retries_on_malformed_response_then_succeeds():
    route = respx.post(GEMINI_URL).mock(
        side_effect=[
            httpx.Response(200, json={"unexpected": "shape"}),
            httpx.Response(
                200,
                json={"candidates": [{"content": {"parts": [{"text": "good"}]}}]},
            ),
        ]
    )
    with patch("asyncio.sleep", new_callable=AsyncMock):
        async with httpx.AsyncClient() as client:
            resp = await call_gemini(_make_request(), client=client)
    assert resp.text == "good"
    assert route.call_count == 2


@respx.mock
async def test_exhausts_retries_on_persistent_malformed_response():
    route = respx.post(GEMINI_URL).mock(
        return_value=httpx.Response(200, json={"unexpected": "shape"}),
    )
    with patch("asyncio.sleep", new_callable=AsyncMock):
        async with httpx.AsyncClient() as client:
            with pytest.raises(RetryableError):
                await call_gemini(_make_request(), client=client)
    assert route.call_count == 3


@respx.mock
async def test_retries_on_connect_error():
    route = respx.post(GEMINI_URL).mock(
        side_effect=[
            httpx.ConnectError("boom"),
            httpx.Response(
                200,
                json={"candidates": [{"content": {"parts": [{"text": "ok"}]}}]},
            ),
        ]
    )
    with patch("asyncio.sleep", new_callable=AsyncMock):
        async with httpx.AsyncClient() as client:
            resp = await call_gemini(_make_request(), client=client)
    assert resp.text == "ok"
    assert route.call_count == 2
