import uuid
from typing import Annotated

from fastapi import Depends
from fastapi_users import FastAPIUsers

from app.accounts.auth import auth_backend
from app.accounts.manager import get_user_manager
from app.accounts.models import User

fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])

current_active_user = fastapi_users.current_user(active=True)

CurrentUser = Annotated[User, Depends(current_active_user)]
