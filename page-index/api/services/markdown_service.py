from fastapi import UploadFile
from api.config import settings
from api.utils.storage import save_upload_file
from pageindex.page_index_md import md_to_tree
import os
import uuid

class MarkdownService:
    async def process_markdown(self, file: UploadFile, **options):
        """Process markdown file and return tree structure."""
        
        # Save temporary file
        temp_filename = f"temp_{uuid.uuid4().hex}.md"
        file_path = save_upload_file(file, temp_filename)
        
        try:
            # Map options to md_to_tree arguments
            # Note: The underlying function uses string values 'yes'/'no' for boolean flags
            result = await md_to_tree(
                md_path=file_path,
                if_thinning=False, # Default config
                if_add_node_id=options.get("if_add_node_id", "yes"),
                if_add_node_summary=options.get("if_add_node_summary", "yes"),
                if_add_node_text=options.get("if_add_node_text", "yes"),
                if_add_doc_description=options.get("if_add_doc_description", "no"),
                model=settings.OPENAI_MODEL
            )
            return result
        finally:
            # Cleanup temp file
            if os.path.exists(file_path):
                os.remove(file_path)
