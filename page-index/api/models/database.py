from sqlalchemy import Column, String, DateTime, JSON, Enum, Boolean, ForeignKey
from sqlalchemy.orm import declarative_base
from datetime import datetime
import enum

Base = declarative_base()

class ProcessingStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class Document(Base):
    __tablename__ = "documents"

    doc_id = Column(String, primary_key=True)
    original_filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)  # "pdf" or "markdown"
    status = Column(Enum(ProcessingStatus), default=ProcessingStatus.PENDING, index=True)
    retrieval_ready = Column(Boolean, default=False)
    result_path = Column(String, nullable=True)
    doc_description = Column(String, nullable=True)
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Retrieval(Base):
    __tablename__ = "retrievals"

    retrieval_id = Column(String, primary_key=True)
    doc_id = Column(String, ForeignKey("documents.doc_id", ondelete="CASCADE"), nullable=False, index=True)
    query = Column(String, nullable=False)
    thinking = Column(Boolean, default=False)
    status = Column(Enum(ProcessingStatus), default=ProcessingStatus.PENDING)
    result = Column(JSON, nullable=True)
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
