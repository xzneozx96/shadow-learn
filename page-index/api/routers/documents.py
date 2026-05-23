from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from api.models.schemas import (
    DocumentUploadResponse,
    DocumentResultResponse,
    DocumentPageResponse,
    DocumentListResponse,
    DocumentListItem,
)
from api.services.document_service import DocumentService
from api.utils.storage import enforce_size_limit
from api.dependencies import get_db
import uuid

router = APIRouter()


@router.get("/", response_model=DocumentListResponse)
async def list_documents(db = Depends(get_db)):
    """List all documents (metadata only) — used for multi-document routing."""
    service = DocumentService(db)
    docs = await service.list_documents()
    return DocumentListResponse(
        documents=[
            DocumentListItem(
                doc_id=d.doc_id,
                original_filename=d.original_filename,
                status=d.status,
                retrieval_ready=d.retrieval_ready,
                doc_description=d.doc_description,
            )
            for d in docs
        ]
    )

@router.post("/", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    db = Depends(get_db)
):
    """Uploaded a PDF document for processing."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported")
    enforce_size_limit(file)

    doc_id = str(uuid.uuid4().hex)[:12]
    service = DocumentService(db)
    await service.queue_processing(doc_id, file)
    
    return DocumentUploadResponse(doc_id=doc_id)

@router.get("/{doc_id}/", response_model=DocumentResultResponse)
async def get_document(
    doc_id: str,
    type: str = "tree",
    summary: bool = False,
    db = Depends(get_db)
):
    """Get processing status and results."""
    service = DocumentService(db)
    return await service.get_document_status(doc_id, type, summary)

@router.get("/{doc_id}/pages/{page_num}", response_model=DocumentPageResponse)
async def get_document_page(
    doc_id: str,
    page_num: int,
    db = Depends(get_db)
):
    """Get raw text content of a specific page."""
    service = DocumentService(db)
    content = await service.get_document_page_content(doc_id, page_num)
    return DocumentPageResponse(
        doc_id=doc_id,
        page_index=page_num,
        content=content
    )

@router.delete("/{doc_id}/")
async def delete_document(doc_id: str, db = Depends(get_db)):
    """Delete a document and all associated data."""
    service = DocumentService(db)
    await service.delete_document(doc_id)
    return {"success": True}

@router.post("/{doc_id}/retry")
async def retry_document(doc_id: str, db = Depends(get_db)):
    """Manually retry a failed document."""
    service = DocumentService(db)
    await service.retry_processing(doc_id)
    return {"success": True, "message": f"Task for {doc_id} re-queued"}

@router.post("/sync")
async def sync_documents(db = Depends(get_db)):
    """Resume all PENDING or FAILED document tasks."""
    service = DocumentService(db)
    count = await service.resume_pending_tasks()
    return {"success": True, "message": f"Re-queued {count} tasks"}
