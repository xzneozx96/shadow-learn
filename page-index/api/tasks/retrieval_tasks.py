from celery import shared_task
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from api.models.database import Retrieval, Document, ProcessingStatus
from api.config import settings
from api.services.retrieval_core import retrieve_from_document

import json
import logging
import os

sync_db_url = settings.DATABASE_URL.replace("postgresql+asyncpg", "postgresql+psycopg2")
engine = create_engine(sync_db_url)
SessionLocal = sessionmaker(bind=engine)

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=2)
def process_retrieval_task(self, retrieval_id: str, doc_id: str, query: str, thinking: bool):
    session = SessionLocal()
    try:
        doc = session.query(Document).filter(Document.doc_id == doc_id).first()
        if not doc or not doc.result_path or not os.path.exists(doc.result_path):
            raise ValueError(f"Document {doc_id} not found or not processed")

        retrieval = session.query(Retrieval).filter(Retrieval.retrieval_id == retrieval_id).first()
        if retrieval:
            retrieval.status = ProcessingStatus.PROCESSING
            session.commit()

        with open(doc.result_path, "r", encoding="utf-8") as f:
            tree_structure = json.load(f).get("structure", [])

        # Retrieval uses RETRIEVAL_MODEL when set, else falls back to OPENAI_MODEL.
        model = settings.RETRIEVAL_MODEL or settings.OPENAI_MODEL
        pdf_path = os.path.join(settings.UPLOAD_DIR, f"{doc_id}.pdf")
        result = retrieve_from_document(
            tree_structure, query, model, pdf_path, settings.LLM_TIMEOUT_SECONDS
        )

        if retrieval:
            retrieval.status = ProcessingStatus.COMPLETED
            retrieval.result = {
                "doc_id": doc_id,
                "query": query,
                "thinking": result["thinking"],
                "retrieved_nodes": result["retrieved_nodes"],
            }
            session.commit()

    except Exception as e:
        logger.error(f"Error processing retrieval {retrieval_id}: {str(e)}")
        retrieval = session.query(Retrieval).filter(Retrieval.retrieval_id == retrieval_id).first()
        if retrieval:
            retrieval.status = ProcessingStatus.FAILED
            retrieval.error_message = str(e)
            session.commit()
        raise self.retry(exc=e, countdown=10 * (2 ** self.request.retries))
    finally:
        session.close()
