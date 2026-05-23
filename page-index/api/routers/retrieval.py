from fastapi import APIRouter, HTTPException, Depends
from api.models.schemas import (
    RetrievalRequest, 
    RetrievalSubmitResponse, 
    RetrievalResultResponse
)
from api.services.retrieval_service import RetrievalService
from api.dependencies import get_db
import uuid

router = APIRouter()

@router.post("/", response_model=RetrievalSubmitResponse)
async def submit_retrieval(
    request: RetrievalRequest,
    db = Depends(get_db)
):
    """Submit a retrieval query."""
    service = RetrievalService(db)
    
    # Check if document is ready
    if not await service.is_document_ready(request.doc_id):
        raise HTTPException(400, "Document not found or not ready for retrieval")
    
    retrieval_id = str(uuid.uuid4().hex)[:12]
    await service.queue_retrieval(retrieval_id, request)
    
    return RetrievalSubmitResponse(retrieval_id=retrieval_id)

@router.get("/{retrieval_id}/", response_model=RetrievalResultResponse)
async def get_retrieval(retrieval_id: str, db = Depends(get_db)):
    """Get retrieval status and results."""
    service = RetrievalService(db)
    return await service.get_retrieval_status(retrieval_id)
