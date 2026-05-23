import os
import shutil
from fastapi import UploadFile, HTTPException
from api.config import settings

def enforce_size_limit(file: UploadFile) -> None:
    """Reject uploads larger than MAX_UPLOAD_MB. Raises 413 if exceeded."""
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    if file.size is not None and file.size > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {settings.MAX_UPLOAD_MB} MB upload limit",
        )

def save_upload_file(file: UploadFile, filename: str) -> str:
    """
    Save an uploaded file to the configured upload directory.
    Returns the absolute path to the saved file.
    """
    destination_dir = settings.UPLOAD_DIR
    os.makedirs(destination_dir, exist_ok=True)
    
    file_path = os.path.join(destination_dir, filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return os.path.abspath(file_path)

def get_result_path(doc_id: str) -> str:
    """Get the expected path for a document result file."""
    return os.path.abspath(os.path.join(settings.RESULTS_DIR, f"{doc_id}.json"))
