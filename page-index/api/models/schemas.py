from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from enum import Enum

# === Document Processing ===

class DocumentUploadResponse(BaseModel):
    doc_id: str

class DocumentStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"

class DocumentPageResponse(BaseModel):
    doc_id: str
    page_index: int
    content: str

class DocumentResultResponse(BaseModel):
    doc_id: str
    status: DocumentStatus
    retrieval_ready: bool = False
    result: Optional[Any] = None
    error: Optional[str] = None

class DocumentListItem(BaseModel):
    doc_id: str
    original_filename: str
    status: DocumentStatus
    retrieval_ready: bool = False
    doc_description: Optional[str] = None

class DocumentListResponse(BaseModel):
    documents: List[DocumentListItem]

# === Markdown Processing ===

class MarkdownResponse(BaseModel):
    success: bool
    doc_name: str
    structure: List[Any]
    doc_description: Optional[str] = None

# === Multi-document search ===

class SearchRequest(BaseModel):
    query: str
    max_docs: int = 10

class SearchPassage(BaseModel):
    doc_id: str
    doc_name: str
    title: str
    content: str

class SearchResponse(BaseModel):
    passages: List[SearchPassage]
    routed_doc_ids: List[str]

# === Retrieval ===

class RetrievalRequest(BaseModel):
    doc_id: str
    query: str
    thinking: bool = False

class RetrievalSubmitResponse(BaseModel):
    retrieval_id: str

class RelevantContent(BaseModel):
    page_index: int
    relevant_content: str

class RetrievedNode(BaseModel):
    title: str
    node_id: str
    relevant_contents: List[RelevantContent]

class RetrievalResultResponse(BaseModel):
    retrieval_id: str
    doc_id: str
    status: str
    query: Optional[str] = None
    thinking: Optional[str] = None
    retrieved_nodes: Optional[List[RetrievedNode]] = None
    error: Optional[str] = None
