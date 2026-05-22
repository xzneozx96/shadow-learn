"""Document search — thin proxy to the self-hosted PageIndex /search endpoint.

PageIndex owns all retrieval logic (routing across docs + per-doc retrieval) and
uses its own LLM key. This proxy only injects the PageIndex API key server-side
so it is never exposed to the frontend.
"""

import logging

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.settings import settings
from app.shared.utils import _resolve_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


class DocumentSearchRequest(BaseModel):
    query: str


class Passage(BaseModel):
    doc_id: str
    doc_name: str
    title: str
    content: str


class DocumentSearchResponse(BaseModel):
    passages: list[Passage]
    routed_doc_ids: list[str]


@router.post("/document-search", response_model=DocumentSearchResponse)
async def document_search(req: DocumentSearchRequest) -> DocumentSearchResponse:
    key = _resolve_key(None, settings.pageindex_api_key, "PageIndex API key")
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{settings.pageindex_base_url}/search/",
                headers={"X-API-Key": key},
                json={"query": req.query},
            )
        resp.raise_for_status()
    except httpx.HTTPError as e:
        logger.error("[document_search] PageIndex upstream error: %s", e)
        raise HTTPException(status_code=502, detail=f"Document search upstream error: {e}")

    return DocumentSearchResponse(**resp.json())
