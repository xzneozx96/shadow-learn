import jwt
from fastapi_users import exceptions, models
from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    JWTStrategy,
)
from fastapi_users.jwt import decode_jwt, generate_jwt
from fastapi_users.manager import BaseUserManager

from app.accounts.models import User
from app.settings import settings


class VersionedJWTStrategy(JWTStrategy[User, models.ID]):
    async def write_token(self, user: User) -> str:
        data = {"sub": str(user.id), "aud": self.token_audience, "ver": user.token_version}
        return generate_jwt(data, self.encode_key, self.lifetime_seconds, algorithm=self.algorithm)

    async def read_token(
        self, token: str | None, user_manager: BaseUserManager[User, models.ID]
    ) -> User | None:
        if token is None:
            return None
        try:
            data = decode_jwt(token, self.decode_key, self.token_audience, algorithms=[self.algorithm])
            user = await user_manager.get(user_manager.parse_id(data["sub"]))
        except (jwt.PyJWTError, KeyError, exceptions.InvalidID, exceptions.UserNotExists):
            return None
        return user if user.token_version == data.get("ver") else None


def get_access_strategy() -> VersionedJWTStrategy:
    return VersionedJWTStrategy(
        secret=settings.jwt_secret,
        lifetime_seconds=settings.access_token_minutes * 60,
        token_audience=["shadowlearn:access"],
    )


def get_refresh_strategy() -> VersionedJWTStrategy:
    return VersionedJWTStrategy(
        secret=settings.jwt_refresh_secret,
        lifetime_seconds=settings.refresh_token_days * 86400,
        token_audience=["shadowlearn:refresh"],
    )


auth_backend = AuthenticationBackend(
    name="jwt",
    transport=BearerTransport(tokenUrl="/api/auth/login"),
    get_strategy=get_access_strategy,
)
