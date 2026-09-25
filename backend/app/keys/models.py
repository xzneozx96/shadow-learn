import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    ForeignKey,
    Identity,
    LargeBinary,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Provider(StrEnum):
    openrouter = "openrouter"
    azure_speech = "azure_speech"
    google = "google"


class KeySource(StrEnum):
    user = "user"
    env = "env"


class ProviderKey(Base):
    __tablename__ = "provider_keys"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), primary_key=True)
    provider: Mapped[Provider] = mapped_column(Enum(Provider, name="provider"), primary_key=True)
    ciphertext: Mapped[bytes] = mapped_column(LargeBinary)
    region: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ProviderUsage(Base):
    __tablename__ = "provider_usage"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), index=True)
    provider: Mapped[Provider] = mapped_column(Enum(Provider, name="provider"))
    source: Mapped[KeySource] = mapped_column(Enum(KeySource, name="key_source"))
    endpoint: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
