"""Multi-document search: route a query to relevant docs, then retrieve from each.

All reasoning uses PageIndex's own configured model/key (litellm reads the key
from the environment) — callers never supply an LLM key.
"""

import asyncio
import json
import logging
import os

# /search runs the routing LLM call inside the API process (not just the worker),
# so the API container must carry an LLM key. Warn loudly if it doesn't.
if not os.getenv("OPENAI_API_KEY") and not os.getenv("OPENROUTER_API_KEY"):
    logging.getLogger(__name__).warning(
        "No OPENAI_API_KEY / OPENROUTER_API_KEY in environment — /search routing "
        "and retrieval will fail. Set one in the API container's environment."
    )

import litellm
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from api.config import settings
from api.models.database import ProcessingStatus
from api.services.document_service import DocumentService
from api.services.retrieval_core import retrieve_from_document

logger = logging.getLogger(__name__)


def _route(query: str, catalogue: list[dict], model: str, max_docs: int, timeout: int) -> list[str]:
    """Pick relevant doc_ids by their descriptions (single LLM call)."""
    prompt = (
        "You are given a user query and a list of documents with ids and descriptions. "
        "Select the documents that may contain information relevant to the query.\n\n"
        f"Query: {query}\n\n"
        f"Documents: {json.dumps(catalogue, ensure_ascii=False)}\n\n"
        'Respond with ONLY this JSON, no other text:\n{"answer": ["doc_id1", "doc_id2"]}\n'
        "Return an empty list if none are relevant."
    )
    model = (model or "").removeprefix("litellm/")
    response = litellm.completion(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        timeout=timeout,
        # Routing is a simple doc-pick — disable reasoning (OpenRouter).
        extra_body={"reasoning": {"effort": "none"}},
    )
    content = response.choices[0].message.content or ""
    try:
        cleaned = content.replace("```json", "").replace("```", "").strip()
        chosen = json.loads(cleaned).get("answer", [])
    except (json.JSONDecodeError, AttributeError):
        logger.warning("[search] router returned unparseable content: %r", content)
        chosen = []
    valid = {d["doc_id"] for d in catalogue}
    return [d for d in chosen if d in valid][:max_docs]


def _retrieve_doc_sync(doc, query: str, model: str, timeout: int) -> list[dict]:
    """Load a doc's tree and run single-doc retrieval (blocking; runs in a threadpool)."""
    if not doc.result_path or not os.path.exists(doc.result_path):
        return []
    with open(doc.result_path, "r", encoding="utf-8") as f:
        doc_info = json.load(f)
    # Normalize into a core doc_info: ensure id/type, and force a valid local PDF
    # path so the cached-pages-or-PDF fallback works for pre-refactor docs too.
    doc_info["id"] = doc.doc_id
    doc_info.setdefault("type", "pdf")
    doc_info["path"] = os.path.join(settings.UPLOAD_DIR, f"{doc.doc_id}.pdf")
    tree_structure = doc_info.get("structure", [])
    result = retrieve_from_document(tree_structure, query, model, doc_info, timeout)
    passages = []
    for node in result["retrieved_nodes"]:
        text = " ".join(
            rc.get("relevant_content", "") for rc in node.get("relevant_contents", [])
        ).strip()
        if text:
            passages.append({
                "doc_id": doc.doc_id,
                "doc_name": doc.original_filename,
                "title": node.get("title", ""),
                "content": text,
            })
    return passages


async def search_documents(db: AsyncSession, query: str, max_docs: int = 3) -> dict:
    service = DocumentService(db)
    all_docs = await service.list_documents()
    ready = [d for d in all_docs if d.status == ProcessingStatus.COMPLETED and d.retrieval_ready]
    if not ready:
        return {"passages": [], "routed_doc_ids": []}

    model = settings.RETRIEVAL_MODEL or settings.OPENAI_MODEL
    timeout = settings.LLM_TIMEOUT_SECONDS

    catalogue = [
        {
            "doc_id": d.doc_id,
            "doc_name": d.original_filename,
            "doc_description": d.doc_description or d.original_filename,
        }
        for d in ready
    ]
    doc_ids = await run_in_threadpool(_route, query, catalogue, model, max_docs, timeout)
    if not doc_ids:
        return {"passages": [], "routed_doc_ids": []}

    by_id = {d.doc_id: d for d in ready}
    groups = await asyncio.gather(*[
        run_in_threadpool(_retrieve_doc_sync, by_id[doc_id], query, model, timeout)
        for doc_id in doc_ids
    ])
    passages = [p for group in groups for p in group]
    return {"passages": passages, "routed_doc_ids": doc_ids}
