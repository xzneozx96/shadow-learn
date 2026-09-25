from typing import Annotated, Literal

from cryptography.fernet import InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.deps import CurrentUser
from app.db import get_session
from app.keys.crypto import decrypt, encrypt
from app.keys.models import Provider, ProviderKey
from app.keys.service import env_key

router = APIRouter(prefix="/api/keys", tags=["keys"])

Session = Annotated[AsyncSession, Depends(get_session)]


class KeyState(BaseModel):
    provider: Provider
    source: Literal["user", "env", "none"]
    last4: str | None = None
    region: str | None = None


class KeyUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: Annotated[str, StringConstraints(strip_whitespace=True, min_length=8, max_length=500)]
    region: Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+$", max_length=40)] | None = None

    @field_validator("region", mode="before")
    @classmethod
    def _normalize_region(cls, value: object) -> object:
        return value.strip().lower() if isinstance(value, str) else value


def _state(provider: Provider, stored: ProviderKey | None) -> KeyState:
    if stored is None:
        return KeyState(provider=provider, source="env" if env_key(provider) else "none")
    try:
        last4 = decrypt(stored.ciphertext)[-4:]
    except InvalidToken:
        last4 = None
    return KeyState(provider=provider, source="user", last4=last4, region=stored.region)


@router.get("")
async def list_keys(user: CurrentUser, session: Session) -> list[KeyState]:
    rows = await session.scalars(select(ProviderKey).where(ProviderKey.user_id == user.id))
    stored = {row.provider: row for row in rows}
    return [_state(provider, stored.get(provider)) for provider in Provider]


@router.put("/{provider}")
async def save_key(provider: Provider, body: KeyUpdate, user: CurrentUser, session: Session) -> KeyState:
    if provider is Provider.azure_speech and not body.region:
        raise HTTPException(status_code=422, detail="Azure Speech needs a region, such as eastus.")
    region = body.region if provider is Provider.azure_speech else None
    upsert = insert(ProviderKey).values(
        user_id=user.id, provider=provider, ciphertext=encrypt(body.value), region=region
    )
    await session.execute(
        upsert.on_conflict_do_update(
            index_elements=[ProviderKey.user_id, ProviderKey.provider],
            set_={"ciphertext": upsert.excluded.ciphertext, "region": upsert.excluded.region, "updated_at": func.now()},
        )
    )
    await session.commit()
    return KeyState(provider=provider, source="user", last4=body.value[-4:], region=region)


@router.delete("/{provider}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_key(provider: Provider, user: CurrentUser, session: Session) -> Response:
    await session.execute(delete(ProviderKey).where(ProviderKey.user_id == user.id, ProviderKey.provider == provider))
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
