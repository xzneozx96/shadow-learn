from celery import Celery
from api.config import settings

celery_app = Celery(
    "pageindex_worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    imports=["api.tasks.pdf_tasks", "api.tasks.retrieval_tasks"] 
)
