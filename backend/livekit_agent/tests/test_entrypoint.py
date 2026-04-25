"""Smoke test for entrypoint: starts both servers, verifies /healthz, shuts down."""
import asyncio
import os
import socket
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

os.environ.setdefault("INTERNAL_TOKEN", "test-token-entrypoint")


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.mark.asyncio
async def test_main_starts_uvicorn_and_agent_then_shuts_down(monkeypatch):
    """Replace agent.server.run with a no-op long sleep, run main() until
    /healthz answers, then cancel."""
    port = _free_port()
    monkeypatch.setenv("HTTP_PORT", str(port))

    # Stub out agent.server.run so we don't need LiveKit credentials.
    async def _fake_run(*_a, **_k):
        await asyncio.sleep(60)

    fake_run = AsyncMock(side_effect=_fake_run)

    import entrypoint

    class _FakeServer:
        run = fake_run

    with patch.dict(sys.modules, {"agent": type(sys)("agent")}):
        sys.modules["agent"].server = _FakeServer()

        task = asyncio.create_task(entrypoint.main())
        try:
            async with httpx.AsyncClient(timeout=5.0) as c:
                # Poll /healthz until uvicorn is up.
                for _ in range(40):
                    try:
                        resp = await c.get(f"http://127.0.0.1:{port}/healthz")
                        if resp.status_code == 200:
                            break
                    except httpx.ConnectError:
                        pass
                    await asyncio.sleep(0.1)
                else:
                    pytest.fail("uvicorn never came up on /healthz")
                assert resp.json() == {"status": "ok"}
            assert fake_run.await_count == 1
        finally:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
