"""Container entrypoint: runs uvicorn and the LiveKit AgentServer concurrently.

`agents.cli.run_app` parses argv and would conflict with uvicorn, so we
await `AgentServer.run()` directly (verified at
livekit/agents/worker.py:513).
"""
from __future__ import annotations

import asyncio
import logging
import os

import uvicorn
from dotenv import load_dotenv

# Load .env before importing modules that read env at import time.
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("livekit-agent.entrypoint")


async def main() -> None:
    # Imports inside main() so test harnesses can patch them.
    from agent import server

    port = int(os.getenv("HTTP_PORT", "8082"))
    config = uvicorn.Config(
        "http_server:app",
        host="0.0.0.0",  # noqa: S104 — bind all interfaces inside container
        port=port,
        log_level="info",
        loop="asyncio",
    )
    http = uvicorn.Server(config)

    logger.info("starting offshore http server on :%d + livekit agent worker", port)

    # asyncio.wait(FIRST_COMPLETED) so when one service exits (e.g. uvicorn on
    # SIGTERM) the other is explicitly cancelled rather than left hanging until
    # Docker's stop grace period fires a SIGKILL.
    tasks = [
        asyncio.create_task(http.serve(), name="uvicorn"),
        asyncio.create_task(server.run(), name="livekit-agent"),
    ]
    _done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    for t in pending:
        t.cancel()
        try:
            await t
        except (asyncio.CancelledError, Exception):
            pass


if __name__ == "__main__":
    asyncio.run(main())
