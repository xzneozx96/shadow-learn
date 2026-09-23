import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Annotated

from cryptography.fernet import InvalidToken
from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.deps import CurrentUser
from app.db import get_session
from app.keys.crypto import decrypt
from app.keys.models import KeySource, Provider, ProviderKey, ProviderUsage
from app.keys.usage import enforce_rate_limit
from app.settings import settings

logger = logging.getLogger(__name__)

PROVIDER_NAMES = {
    Provider.openrouter: "OpenRouter",
    Provider.azure_speech: "Azure Speech",
    Provider.google: "Google",
}


class NoProviderKey(HTTPException):
    def __init__(self, provider: Provider) -> None:
        super().__init__(status_code=400, detail=f"No {PROVIDER_NAMES[provider]} key configured. Add one in Settings.")


@dataclass(frozen=True)
class ResolvedKey:
    value: str
    region: str | None
    source: KeySource


def env_key(provider: Provider) -> ResolvedKey | None:
    match provider:
        case Provider.openrouter:
            value, region = settings.openrouter_api_key, None
        case Provider.azure_speech:
            if not settings.azure_speech_region:
                return None
            value, region = settings.azure_speech_key, settings.azure_speech_region
        case Provider.google:
            value, region = settings.google_api_key, None
    return ResolvedKey(value, region, KeySource.env) if value else None


async def resolve_provider_key(
    session: AsyncSession, user_id: uuid.UUID, provider: Provider, endpoint: str
) -> ResolvedKey:
    started = time.perf_counter()
    stored = await session.get(ProviderKey, (user_id, provider))
    if stored is None:
        resolved = env_key(provider)
        if resolved is None:
            raise NoProviderKey(provider)
    else:
        try:
            resolved = ResolvedKey(decrypt(stored.ciphertext), stored.region, KeySource.user)
        except InvalidToken:
            raise HTTPException(
                status_code=400,
                detail=f"Your saved {PROVIDER_NAMES[provider]} key can no longer be read. Save it again in Settings.",
            ) from None
    session.add(ProviderUsage(user_id=user_id, provider=provider, source=resolved.source, endpoint=endpoint))
    await session.commit()
    logger.info(
        "resolve_provider_key provider=%s source=%s took %.2f",
        provider,
        resolved.source,
        (time.perf_counter() - started) * 1000,
    )
    return resolved


@dataclass
class KeyResolver:
    session: AsyncSession
    user_id: uuid.UUID
    endpoint: str
    _resolved: dict[Provider, ResolvedKey] = field(default_factory=dict)

    async def __call__(self, provider: Provider) -> ResolvedKey:
        if provider not in self._resolved:
            self._resolved[provider] = await resolve_provider_key(self.session, self.user_id, provider, self.endpoint)
        return self._resolved[provider]


def get_key_resolver(
    request: Request,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    _: Annotated[None, Depends(enforce_rate_limit)],
) -> KeyResolver:
    return KeyResolver(session, user.id, request.scope["route"].path)


ProviderKeys = Annotated[KeyResolver, Depends(get_key_resolver)]
