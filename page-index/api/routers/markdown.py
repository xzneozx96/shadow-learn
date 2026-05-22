from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from api.models.schemas import MarkdownResponse
from api.services.markdown_service import MarkdownService
from api.utils.storage import enforce_size_limit

router = APIRouter()

@router.post("/", response_model=MarkdownResponse)
async def process_markdown(
    file: UploadFile = File(...),
    if_add_node_id: str = Form("yes"),
    if_add_node_summary: str = Form("yes"),
    if_add_node_text: str = Form("yes"),
    if_add_doc_description: str = Form("no")
):
    """Convert Markdown to tree structure."""
    if not file.filename.lower().endswith((".md", ".markdown")):
        raise HTTPException(400, "Only Markdown files are supported")
    enforce_size_limit(file)

    service = MarkdownService()
    result = await service.process_markdown(
        file,
        if_add_node_id=if_add_node_id,
        if_add_node_summary=if_add_node_summary,
        if_add_node_text=if_add_node_text,
        if_add_doc_description=if_add_doc_description
    )
    
    return MarkdownResponse(
        success=True,
        doc_name=result.get("doc_name", ""),
        structure=result.get("structure", []),
        doc_description=result.get("doc_description")
    )
