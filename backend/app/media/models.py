import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class MediaKind(StrEnum):
    video = "video"
    audio = "audio"
    shadowing = "shadowing"
    tts = "tts"


class MediaObject(Base):
    __tablename__ = "media_objects"
    __table_args__ = (
        CheckConstraint(
            "(kind = 'tts') = (user_id IS NULL AND lesson_id IS NULL)", name="ck_media_objects_owner"
        ),
        Index(
            "uq_media_objects_shadowing",
            "user_id",
            "lesson_id",
            "segment_id",
            unique=True,
            postgresql_where=text("kind = 'shadowing'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), index=True)
    kind: Mapped[MediaKind] = mapped_column(Enum(MediaKind, name="media_kind"))
    lesson_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"), index=True)
    segment_id: Mapped[str | None] = mapped_column(Text)
    object_key: Mapped[str] = mapped_column(Text, unique=True)
    size: Mapped[int] = mapped_column(BigInteger)
    sha256: Mapped[str] = mapped_column(Text)
    content_type: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
