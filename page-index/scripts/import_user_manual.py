"""One-off: import the pre-processed USER_MANUAL.pdf (from the standalone PageIndex
workspace) into the API store so it's retrievable via /search.

Creates: uploads/{doc_id}.pdf, results/{doc_id}.json, and a completed Document row.
Run from the page-index/ directory so api.config reads page-index/.env.
"""
import os
import sys
import json
import shutil

sys.path.insert(0, os.getcwd())

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.config import settings
from api.models.database import Document, ProcessingStatus

SRC = "/home/ross-geller/Projects/open_source/PageIndex/examples"
SRC_PDF = f"{SRC}/documents/USER_MANUAL.pdf"
SRC_JSON = f"{SRC}/workspace/e49d052d-190a-4d61-9ea8-eae8fedf1874.json"
DOC_ID = "e49d052d-190a-4d61-9ea8-eae8fedf1874"

uploads = os.path.abspath(settings.UPLOAD_DIR)
results = os.path.abspath(settings.RESULTS_DIR)
os.makedirs(uploads, exist_ok=True)
os.makedirs(results, exist_ok=True)

pdf_dst = os.path.join(uploads, f"{DOC_ID}.pdf")
json_dst = os.path.join(results, f"{DOC_ID}.json")

shutil.copy(SRC_PDF, pdf_dst)
data = json.load(open(SRC_JSON, encoding="utf-8"))
with open(json_dst, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False)

sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg", "postgresql+psycopg2")
engine = create_engine(sync_url)
session = sessionmaker(bind=engine)()

doc = session.query(Document).filter(Document.doc_id == DOC_ID).first()
if doc is None:
    doc = Document(doc_id=DOC_ID)
    session.add(doc)
doc.original_filename = "USER_MANUAL.pdf"
doc.file_type = "pdf"
doc.status = ProcessingStatus.COMPLETED
doc.retrieval_ready = True
doc.result_path = json_dst
doc.doc_description = data.get("doc_description")
session.commit()
session.close()

print(f"Imported {DOC_ID}")
print(f"  pdf:    {pdf_dst}")
print(f"  result: {json_dst}")
print(f"  desc:   {str(data.get('doc_description'))[:90]}...")
