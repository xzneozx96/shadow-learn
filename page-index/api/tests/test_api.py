import json
import os

import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport

from api.main import app
from api.config import settings
from api.models.database import Document, Retrieval, ProcessingStatus


def _mock_redis():
    """Patch the Redis client used by /health so the ping succeeds without a server."""
    client = AsyncMock()
    client.ping = AsyncMock(return_value=True)
    client.aclose = AsyncMock(return_value=None)
    return patch("api.main.aioredis.from_url", return_value=client)


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    with _mock_redis():
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


@pytest.mark.asyncio
async def test_missing_api_key_rejected(client: AsyncClient):
    # The shared `client` fixture sends the key by default; override with no auth header.
    response = await client.post("/doc/", files={"file": ("t.pdf", b"%PDF-1.4", "application/pdf")}, headers={"X-API-Key": ""})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_retrieval_task_imports():
    # Regression guard: the worker task must import (previously broke on ChatGPT_API).
    from api.tasks.retrieval_tasks import process_retrieval_task  # noqa: F401


@pytest.mark.asyncio
async def test_markdown_processing(client: AsyncClient):
    mock_result = {
        "doc_name": "test",
        "doc_description": "Test description",
        "structure": [{"title": "Test Node", "node_id": "0001"}]
    }

    with patch("api.services.markdown_service.MarkdownService.process_markdown", return_value=mock_result):
        files = {"file": ("test.md", b"# Test Header\n\nContent", "text/markdown")}
        response = await client.post("/markdown/", files=files)

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["doc_name"] == "test"
        assert len(data["structure"]) == 1


@pytest.mark.asyncio
async def test_upload_pdf(client: AsyncClient):
    with patch("api.tasks.pdf_tasks.process_pdf_task.delay") as mock_task:
        files = {"file": ("test.pdf", b"%PDF-1.4...", "application/pdf")}
        response = await client.post("/doc/", files=files)

        assert response.status_code == 200
        data = response.json()
        assert "doc_id" in data

        mock_task.assert_called_once()

        doc_id = data["doc_id"]
        status_response = await client.get(f"/doc/{doc_id}/")
        assert status_response.status_code == 200
        assert status_response.json()["doc_id"] == doc_id
        assert status_response.json()["status"] == "pending"


@pytest.mark.asyncio
async def test_retrieval_flow(client: AsyncClient, db_session):
    # Parent document must exist — the retrievals.doc_id FK enforces it.
    db_session.add(Document(
        doc_id="test_doc_id",
        original_filename="x.pdf",
        file_type="pdf",
        status=ProcessingStatus.COMPLETED,
        retrieval_ready=True,
    ))
    await db_session.commit()

    with patch("api.services.retrieval_service.RetrievalService.is_document_ready", return_value=True):
        with patch("api.tasks.retrieval_tasks.process_retrieval_task.delay") as mock_task:
            payload = {"doc_id": "test_doc_id", "query": "test query"}
            response = await client.post("/retrieval/", json=payload)

            assert response.status_code == 200
            data = response.json()
            assert "retrieval_id" in data

            mock_task.assert_called_once()

            retrieval_id = data["retrieval_id"]
            status_response = await client.get(f"/retrieval/{retrieval_id}/")
            assert status_response.status_code == 200
            assert status_response.json()["status"] == "pending"


@pytest.mark.asyncio
async def test_list_documents(client: AsyncClient, db_session):
    db_session.add(Document(
        doc_id="listdoc12345",
        original_filename="m.pdf",
        file_type="pdf",
        status=ProcessingStatus.COMPLETED,
        retrieval_ready=True,
        doc_description="A test manual about widgets.",
    ))
    await db_session.commit()

    response = await client.get("/doc/")
    assert response.status_code == 200
    docs = response.json()["documents"]
    match = [d for d in docs if d["doc_id"] == "listdoc12345"]
    assert len(match) == 1
    assert match[0]["doc_description"] == "A test manual about widgets."


@pytest.mark.asyncio
async def test_search_routes_and_retrieves(client: AsyncClient, db_session, tmp_path):
    # A completed, retrieval-ready doc with a result JSON on disk.
    result_path = tmp_path / "searchdoc.json"
    result_path.write_text(json.dumps({"structure": [{"title": "Setup", "node_id": "0001"}]}))
    doc_id = "searchdoc123"
    db_session.add(Document(
        doc_id=doc_id,
        original_filename="manual.pdf",
        file_type="pdf",
        status=ProcessingStatus.COMPLETED,
        retrieval_ready=True,
        result_path=str(result_path),
        doc_description="A manual about setup.",
    ))
    await db_session.commit()

    # Mock the two LLM-backed steps (routing + per-doc retrieval).
    with patch("api.services.search_service._route", return_value=[doc_id]):
        with patch(
            "api.services.search_service.retrieve_from_document",
            return_value={
                "retrieved_nodes": [{
                    "title": "Setup",
                    "node_id": "0001",
                    "relevant_contents": [{"page_index": 1, "relevant_content": "Install the app first."}],
                }],
                "thinking": None,
            },
        ):
            response = await client.post("/search/", json={"query": "how to set up"})

    assert response.status_code == 200
    data = response.json()
    assert data["routed_doc_ids"] == [doc_id]
    assert len(data["passages"]) == 1
    assert data["passages"][0]["doc_name"] == "manual.pdf"
    assert "Install the app" in data["passages"][0]["content"]


@pytest.mark.asyncio
async def test_search_no_docs_returns_empty(client: AsyncClient):
    response = await client.post("/search/", json={"query": "anything"})
    assert response.status_code == 200
    assert response.json() == {"passages": [], "routed_doc_ids": []}


@pytest.mark.asyncio
async def test_delete_removes_files(client: AsyncClient, db_session, tmp_path):
    settings.UPLOAD_DIR = str(tmp_path / "uploads")
    settings.RESULTS_DIR = str(tmp_path / "results")
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.RESULTS_DIR, exist_ok=True)

    doc_id = "deldoc123456"
    pdf_path = os.path.join(settings.UPLOAD_DIR, f"{doc_id}.pdf")
    json_path = os.path.join(settings.RESULTS_DIR, f"{doc_id}.json")
    with open(pdf_path, "wb") as f:
        f.write(b"%PDF-1.4")
    with open(json_path, "w") as f:
        f.write("{}")

    db_session.add(Document(
        doc_id=doc_id,
        original_filename="x.pdf",
        file_type="pdf",
        status=ProcessingStatus.COMPLETED,
        result_path=json_path,
    ))
    await db_session.commit()

    response = await client.delete(f"/doc/{doc_id}/")
    assert response.status_code == 200
    assert not os.path.exists(pdf_path)
    assert not os.path.exists(json_path)


@pytest.mark.asyncio
async def test_delete_cascades_retrievals(client: AsyncClient, db_session):
    from sqlalchemy import select

    doc_id = "cascade12345"
    db_session.add(Document(
        doc_id=doc_id,
        original_filename="x.pdf",
        file_type="pdf",
        status=ProcessingStatus.COMPLETED,
    ))
    db_session.add(Retrieval(
        retrieval_id="ret123456789",
        doc_id=doc_id,
        query="q",
        status=ProcessingStatus.COMPLETED,
    ))
    await db_session.commit()

    response = await client.delete(f"/doc/{doc_id}/")
    assert response.status_code == 200

    rows = (await db_session.execute(select(Retrieval).filter(Retrieval.doc_id == doc_id))).scalars().all()
    assert rows == []
