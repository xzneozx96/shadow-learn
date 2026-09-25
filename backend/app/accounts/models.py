from datetime import datetime

from fastapi_users_db_sqlalchemy import SQLAlchemyBaseUserTableUUID
from sqlalchemy import DateTime, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class User(SQLAlchemyBaseUserTableUUID, Base):
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
