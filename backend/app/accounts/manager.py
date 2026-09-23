import logging
import smtplib
import uuid
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from fastapi_users import BaseUserManager, InvalidPasswordException, UUIDIDMixin
from fastapi_users_db_sqlalchemy import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.email import send_reset_email
from app.accounts.models import User
from app.accounts.schemas import UserCreate
from app.db import get_session
from app.settings import settings

logger = logging.getLogger(__name__)

MIN_PASSWORD_LENGTH = 8


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = settings.jwt_secret

    async def validate_password(self, password: str, user: UserCreate | User) -> None:
        if len(password) < MIN_PASSWORD_LENGTH:
            raise InvalidPasswordException(
                reason=f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
            )

    async def on_after_forgot_password(
        self, user: User, token: str, request: Request | None = None
    ) -> None:
        try:
            await send_reset_email(user.email, token)
        except (smtplib.SMTPException, OSError):
            # The route answers 202 whether or not the account exists, so a
            # delivery failure must not surface as a 500 that confirms it does.
            logger.exception("reset email to user %s failed", user.id)

    async def on_after_reset_password(self, user: User, request: Request | None = None) -> None:
        await self.user_db.update(user, {"token_version": user.token_version + 1})


async def get_user_db(session: Annotated[AsyncSession, Depends(get_session)]) -> AsyncIterator[SQLAlchemyUserDatabase]:
    yield SQLAlchemyUserDatabase(session, User)


async def get_user_manager(
    user_db: Annotated[SQLAlchemyUserDatabase, Depends(get_user_db)],
) -> AsyncIterator[UserManager]:
    yield UserManager(user_db)
