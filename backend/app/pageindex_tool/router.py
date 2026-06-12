"""Thin forward to agentic-rag's /api/pageindex/tool MCP bridge.

agentic-rag owns all retrieval logic. Its /api/pageindex/tool route is
authenticated; the companion is the external full-access consumer, so this
server-to-server forward sends Authorization: Bearer <agentic_rag_api_key>
(== agentic-rag's API_SECRET_KEY). The request/response are passed through
verbatim. The key must stay server-side; never expose it to the browser.
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
    headers = {}
    if settings.agentic_rag_api_key:
        headers["Authorization"] = f"Bearer {settings.agentic_rag_api_key}"
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{settings.agentic_rag_base_url}/api/pageindex/tool",
                json={"name": req.name, "args": req.args},
                headers=headers,
            )
        resp.raise_for_status()
    except httpx.HTTPError as e:
        logger.error("[pageindex_tool] agentic-rag upstream error: %s", e)
        raise HTTPException(status_code=502, detail=f"PageIndex tool upstream error: {e}")
    return resp.json()
