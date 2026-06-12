"""Tests for the /api/pageindex/tool forward route."""

import httpx
from fastapi.testclient import TestClient

from app.main import app
from app.pageindex_tool import router as pageindex_router


class _FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("upstream error", request=None, response=None)


class _FakeAsyncClient:
    """Captures the forwarded request and returns a canned response."""

    last_call = {}
    raise_error = False

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, url, json=None, **kwargs):
        _FakeAsyncClient.last_call = {"url": url, "json": json, "headers": kwargs.get("headers")}
        if _FakeAsyncClient.raise_error:
            raise httpx.HTTPError("boom")
        return _FakeResponse({"documents": [{"name": "GRAMMAR.pdf"}], "has_more": False})


def test_pageindex_tool_forwards_name_and_args(monkeypatch):
    monkeypatch.setattr(pageindex_router.httpx, "AsyncClient", _FakeAsyncClient)
    monkeypatch.setattr(pageindex_router.settings, "agentic_rag_api_key", "test-secret")
    client = TestClient(app)

    resp = client.post(
        "/api/pageindex/tool",
        json={"name": "browse_documents", "args": {"sort": "relevance", "query": "把"}},
    )

    assert resp.status_code == 200
    assert resp.json() == {"documents": [{"name": "GRAMMAR.pdf"}], "has_more": False}
    # Forwarded verbatim to agentic-rag's /api/pageindex/tool
    assert _FakeAsyncClient.last_call["url"].endswith("/api/pageindex/tool")
    assert _FakeAsyncClient.last_call["json"] == {
        "name": "browse_documents",
        "args": {"sort": "relevance", "query": "把"},
    }
    # The shared API key is forwarded as a Bearer header (external full-access auth).
    assert _FakeAsyncClient.last_call["headers"]["Authorization"] == "Bearer test-secret"


def test_pageindex_tool_returns_502_on_upstream_error(monkeypatch):
    _FakeAsyncClient.raise_error = True
    try:
        monkeypatch.setattr(pageindex_router.httpx, "AsyncClient", _FakeAsyncClient)
        client = TestClient(app)
        resp = client.post(
            "/api/pageindex/tool",
            json={"name": "browse_documents", "args": {}},
        )
        assert resp.status_code == 502
    finally:
        _FakeAsyncClient.raise_error = False
