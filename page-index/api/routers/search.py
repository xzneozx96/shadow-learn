from fastapi import APIRouter, Depends

from api.models.schemas import SearchRequest, SearchResponse
from api.services.search_service import search_documents
from api.dependencies import get_db

router = APIRouter()


@router.post("/", response_model=SearchResponse)
async def search(request: SearchRequest, db = Depends(get_db)):
    """Search across all indexed documents: route by description, then retrieve."""
    result = await search_documents(db, request.query, request.max_docs)
    return SearchResponse(**result)
