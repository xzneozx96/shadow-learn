from celery import shared_task
from api.models.database import Document, ProcessingStatus
from api.config import settings
from pageindex.client import PageIndexClient
from pageindex.utils import remove_fields
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import json
import os
import logging

# Synchronous engine for Celery worker
# Note: transforming postgresql+asyncpg to postgresql+psycopg2
sync_db_url = settings.DATABASE_URL.replace("postgresql+asyncpg", "postgresql+psycopg2")
engine = create_engine(sync_db_url)
SessionLocal = sessionmaker(bind=engine)

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3)
def process_pdf_task(self, doc_id: str, file_path: str, options: dict):
    """Process PDF document using PageIndex core."""
    session = SessionLocal()
    try:
        # Update status to processing
        doc = session.query(Document).filter(Document.doc_id == doc_id).first()
        if doc:
            doc.status = ProcessingStatus.PROCESSING
            session.commit()
        
        # Run PageIndex processing via the shared client so the API result
        # matches the up-to-date core output.
        # NOTE: PageIndexClient.index hardcodes if_add_* flags to 'yes', so the
        # per-flag entries in `options` are inert; only `model` is honored.
        logger.info(f"Starting PageIndex processing for {doc_id}")
        client = PageIndexClient(model=options.get("model"))
        client_doc_id = client.index(file_path, mode="pdf")
        result = client.documents[client_doc_id]

        # Use the API's doc_id and drop node `text` to keep the result lean.
        result["id"] = doc_id
        if result.get("structure"):
            result["structure"] = remove_fields(result["structure"], fields=["text"])
        # Drop the full per-page cache: retrieval reads only the pages it needs
        # from the PDF on demand (get_page_content -> PyPDF2), so caching all
        # pages here bloats the JSON (e.g. 300+ pages) for no benefit.
        result.pop("pages", None)

        # Save result
        result_filename = f"{doc_id}.json"
        result_path = os.path.join(settings.RESULTS_DIR, result_filename)
        os.makedirs(os.path.dirname(result_path), exist_ok=True)
        
        with open(result_path, "w", encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        # Update status to completed
        doc = session.query(Document).filter(Document.doc_id == doc_id).first()
        if doc:
            doc.status = ProcessingStatus.COMPLETED
            doc.result_path = result_path
            doc.retrieval_ready = True
            doc.doc_description = result.get("doc_description")
            session.commit()
            
        return {"status": "success", "doc_id": doc_id}
        
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        logger.error(f"Error processing PDF {doc_id}:\n{error_detail}")
        doc = session.query(Document).filter(Document.doc_id == doc_id).first()
        if doc:
            doc.status = ProcessingStatus.FAILED
            doc.error_message = str(e)
            session.commit()
        raise self.retry(exc=e, countdown=60 * (2 ** self.request.retries))
    finally:
        session.close()
