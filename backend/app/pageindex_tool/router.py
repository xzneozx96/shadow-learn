"""Thin forward to agentic-rag's /api/pageindex/tool MCP bridge.

agentic-rag owns all retrieval logic. Its /api/pageindex/tool route is
CORS-gated and unauthenticated; a server-to-server forward bypasses browser
CORS, so this proxy injects no auth header. The request/response are passed
through verbatim.
"""

import logging

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any

from app.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


class PageIndexToolRequest(BaseModel):
    name: str
    args: dict[str, Any] = {}


@router.post("/pageindex/tool")
async def pageindex_tool(req: PageIndexToolRequest):
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{settings.agentic_rag_base_url}/api/pageindex/tool",
                json={"name": req.name, "args": req.args},
            )
        resp.raise_for_status()
    except httpx.HTTPError as e:
        logger.error("[pageindex_tool] agentic-rag upstream error: %s", e)
        raise HTTPException(status_code=502, detail=f"PageIndex tool upstream error: {e}")
    return resp.json()
