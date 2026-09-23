import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

LIVE_KEY_PREDICATE = text("status <> 'error'")


class JobRow(Base):
    __tablename__ = "jobs"
    __table_args__ = (Index("uq_jobs_live_key", "key", unique=True, postgresql_where=LIVE_KEY_PREDICATE),)

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), index=True)
    key: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text)
    step: Mapped[str] = mapped_column(Text)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
