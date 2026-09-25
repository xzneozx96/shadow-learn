import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class CatalogTTS(Base):
    __tablename__ = "catalog_tts"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    media_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("media_objects.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CatalogWordBreakdown(Base):
    __tablename__ = "catalog_word_breakdowns"

    word: Mapped[str] = mapped_column(Text, primary_key=True)
    lang: Mapped[str] = mapped_column(Text, primary_key=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CatalogTipTranscript(Base):
    __tablename__ = "catalog_tip_transcripts"

    video_id: Mapped[str] = mapped_column(Text, primary_key=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CatalogTipStudio(Base):
    __tablename__ = "catalog_tip_studio"

    video_id: Mapped[str] = mapped_column(Text, primary_key=True)
    kind: Mapped[str] = mapped_column(Text, primary_key=True)
    locale: Mapped[str] = mapped_column(Text, primary_key=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CatalogTipCards(Base):
    __tablename__ = "catalog_tip_cards"

    video_id: Mapped[str] = mapped_column(Text, primary_key=True)
    locale: Mapped[str] = mapped_column(Text, primary_key=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
