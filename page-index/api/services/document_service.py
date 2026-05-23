from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from fastapi import UploadFile, HTTPException
from api.models.database import Document, ProcessingStatus
from api.utils.storage import save_upload_file, get_result_path
from api.tasks.pdf_tasks import process_pdf_task
from api.config import settings
import json
import os
import logging
import aiofiles
import fitz  # PyMuPDF
from starlette.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)

class DocumentService:
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def queue_processing(self, doc_id: str, file: UploadFile):
        """Save file and queue for processing."""
        # Save file to disk
        file_path = save_upload_file(file, f"{doc_id}.pdf")
        
        # Create DB entry
        new_doc = Document(
            doc_id=doc_id,
            original_filename=file.filename,
            file_type="pdf",
            status=ProcessingStatus.PENDING
        )
        self.db.add(new_doc)
        await self.db.commit()
        await self.db.refresh(new_doc)
        
        # Queue background task
        options = {
            "model": settings.OPENAI_MODEL,
            "if_add_doc_description": "yes",  # enables multi-doc routing by description
        }
        process_pdf_task.delay(doc_id, file_path, options)
        
        return new_doc

    async def retry_processing(self, doc_id: str):
        """Manually trigger a retry for a specific document."""
        stmt = select(Document).filter(Document.doc_id == doc_id)
        result = await self.db.execute(stmt)
        doc = result.scalar_one_or_none()
        
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Reset status
        doc.status = ProcessingStatus.PENDING
        doc.error_message = None
        await self.db.commit()
        
        # Determine file path
        file_path = os.path.join(settings.UPLOAD_DIR, f"{doc_id}.pdf")
        
        # Re-queue
        process_pdf_task.delay(doc_id, file_path, {"model": settings.OPENAI_MODEL})
        return doc

    async def resume_pending_tasks(self):
        """Scan DB for PENDING/FAILED tasks and re-queue them."""
        stmt = select(Document).filter(
            Document.status.in_([
                ProcessingStatus.PENDING,
                ProcessingStatus.PROCESSING,
                ProcessingStatus.FAILED,
            ])
        )
        result = await self.db.execute(stmt)
        docs = result.scalars().all()
        
        queued_count = 0
        for doc in docs:
            file_path = os.path.join(settings.UPLOAD_DIR, f"{doc.doc_id}.pdf")
            if os.path.exists(file_path):
                doc.status = ProcessingStatus.PENDING
                doc.error_message = None
                process_pdf_task.delay(doc.doc_id, file_path, {"model": settings.OPENAI_MODEL})
                queued_count += 1
        
        await self.db.commit()
        return queued_count

    async def list_documents(self):
        """Return all documents (metadata only) for multi-doc routing."""
        result = await self.db.execute(select(Document))
        return result.scalars().all()

    async def get_document_status(self, doc_id: str, type_Filter: str = "tree", summary: bool = False):
        """Get document status and results."""
        stmt = select(Document).filter(Document.doc_id == doc_id)
        result = await self.db.execute(stmt)
        doc = result.scalar_one_or_none()
        
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        
        response = {
            "doc_id": doc.doc_id,
            "status": doc.status,
            "retrieval_ready": doc.retrieval_ready,
            "error": doc.error_message
        }
        
        # Include results if completed
        if doc.status == ProcessingStatus.COMPLETED and doc.result_path and os.path.exists(doc.result_path):
            async with aiofiles.open(doc.result_path, mode='r') as f:
                content = await f.read()
                result_data = json.loads(content)
                # The result structure matches "tree" type by default from pageindex
                response["result"] = result_data.get("structure", [])
                
        return response

    async def delete_document(self, doc_id: str):
        """Delete document record and files."""
        stmt = select(Document).filter(Document.doc_id == doc_id)
        result = await self.db.execute(stmt)
        doc = result.scalar_one_or_none()
        
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        # Best-effort file cleanup. Only PDFs keep an uploaded file on disk;
        # markdown uploads remove their temp file after processing.
        paths_to_remove = [doc.result_path or get_result_path(doc_id)]
        if doc.file_type == "pdf":
            paths_to_remove.append(os.path.join(settings.UPLOAD_DIR, f"{doc_id}.pdf"))
        for path in paths_to_remove:
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except OSError as e:
                    logger.warning(f"Failed to remove {path} for {doc_id}: {e}")

        # Child Retrieval rows are removed by the ON DELETE CASCADE FK.
        await self.db.delete(doc)
        await self.db.commit()

    async def get_document_page_content(self, doc_id: str, page_num: int) -> str:
        """Get raw text content of a specific page (1-based index)."""
        stmt = select(Document).filter(Document.doc_id == doc_id)
        result = await self.db.execute(stmt)
        doc = result.scalar_one_or_none()
        
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
            
        file_path = os.path.join(settings.UPLOAD_DIR, f"{doc_id}.pdf")
        if not os.path.exists(file_path):
             raise HTTPException(status_code=404, detail="Document file not found")

        def _read_pdf_page(path, p_num):
            try:
                with fitz.open(path) as pdf:
                    # page_num in API is 1-based, fitz is 0-based
                    if p_num < 1 or p_num > len(pdf):
                        raise ValueError(f"Page number {p_num} out of range (1-{len(pdf)})")
                    
                    page = pdf[p_num - 1]
                    return page.get_text()
            except ValueError as ve:
                raise HTTPException(status_code=400, detail=str(ve))
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Error reading PDF: {str(e)}")

        return await run_in_threadpool(_read_pdf_page, file_path, page_num)
