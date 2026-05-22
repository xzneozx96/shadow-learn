from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException
from api.models.database import Retrieval, Document, ProcessingStatus
from api.models.schemas import RetrievalRequest
from api.tasks.retrieval_tasks import process_retrieval_task

class RetrievalService:
    def __init__(self, db: AsyncSession):
        self.db = db
        
    async def is_document_ready(self, doc_id: str) -> bool:
        stmt = select(Document).filter(Document.doc_id == doc_id)
        result = await self.db.execute(stmt)
        doc = result.scalar_one_or_none()
        return doc is not None and doc.retrieval_ready
        
    async def queue_retrieval(self, retrieval_id: str, request: RetrievalRequest):
        new_retrieval = Retrieval(
            retrieval_id=retrieval_id,
            doc_id=request.doc_id,
            query=request.query,
            thinking=request.thinking,
            status=ProcessingStatus.PENDING
        )
        self.db.add(new_retrieval)
        await self.db.commit()
        
        # Queue task
        process_retrieval_task.delay(
            retrieval_id, 
            request.doc_id, 
            request.query, 
            request.thinking
        )
        
    async def get_retrieval_status(self, retrieval_id: str):
        stmt = select(Retrieval).filter(Retrieval.retrieval_id == retrieval_id)
        result = await self.db.execute(stmt)
        retrieval = result.scalar_one_or_none()
        
        if not retrieval:
            raise HTTPException(status_code=404, detail="Retrieval task not found")
            
        response = {
            "retrieval_id": retrieval.retrieval_id,
            "doc_id": retrieval.doc_id,
            "status": retrieval.status,
            "query": retrieval.query,
            "error": retrieval.error_message
        }
        
        if retrieval.status == ProcessingStatus.COMPLETED and retrieval.result:
            response["retrieved_nodes"] = retrieval.result.get("retrieved_nodes", [])
            if retrieval.result.get("thinking"):
                response["thinking"] = retrieval.result.get("thinking")
            
        return response
