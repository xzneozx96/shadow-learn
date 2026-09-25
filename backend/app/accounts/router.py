from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users.router.common import ErrorCode

from app.accounts.auth import get_access_strategy, get_refresh_strategy
from app.accounts.deps import CurrentUser, fastapi_users
from app.accounts.manager import UserManager, get_user_manager
from app.accounts.models import User
from app.accounts.schemas import RefreshRequest, TokenPair, UserCreate, UserRead

auth_router = APIRouter(prefix="/api/auth", tags=["auth"])
users_router = APIRouter(prefix="/api/users", tags=["users"])


async def _token_pair(user: User) -> TokenPair:
    return TokenPair(
        access_token=await get_access_strategy().write_token(user),
        refresh_token=await get_refresh_strategy().write_token(user),
    )


@auth_router.post("/login")
async def login(
    credentials: Annotated[OAuth2PasswordRequestForm, Depends()],
    user_manager: Annotated[UserManager, Depends(get_user_manager)],
) -> TokenPair:
    user = await user_manager.authenticate(credentials)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ErrorCode.LOGIN_BAD_CREDENTIALS)
    return await _token_pair(user)


@auth_router.post("/refresh")
async def refresh(
    body: RefreshRequest,
    user_manager: Annotated[UserManager, Depends(get_user_manager)],
) -> TokenPair:
    user = await get_refresh_strategy().read_token(body.refresh_token, user_manager)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    return await _token_pair(user)


@auth_router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    user: CurrentUser,
    user_manager: Annotated[UserManager, Depends(get_user_manager)],
) -> None:
    await user_manager.revoke_tokens(user)


auth_router.include_router(fastapi_users.get_register_router(UserRead, UserCreate))
auth_router.include_router(fastapi_users.get_reset_password_router())


@users_router.get("/me")
async def me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)
