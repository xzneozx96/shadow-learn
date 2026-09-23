import json
import logging

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from sqlalchemy import func, select

from app.keys.crypto import encrypt
from app.keys.models import KeySource, Provider, ProviderKey, ProviderUsage
from app.keys.service import resolve_provider_key

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _usage(db_session) -> list[tuple]:
    rows = await db_session.execute(select(ProviderUsage.provider, ProviderUsage.source, ProviderUsage.endpoint))
    return [tuple(row) for row in rows]


async def _save(db_session, user, provider, value, region=None):
    db_session.add(ProviderKey(user_id=user.id, provider=provider, ciphertext=encrypt(value), region=region))
    await db_session.commit()


async def test_user_key_wins_over_env(db_session, stored_user, provider_env):
    await _save(db_session, stored_user, Provider.openrouter, "user-openrouter-key")

    resolved = await resolve_provider_key(db_session, stored_user.id, Provider.openrouter, "/api/quiz/generate")

    assert (resolved.value, resolved.source) == ("user-openrouter-key", KeySource.user)
    assert await _usage(db_session) == [(Provider.openrouter, KeySource.user, "/api/quiz/generate")]


async def test_user_azure_key_carries_its_region(db_session, stored_user, provider_env):
    await _save(db_session, stored_user, Provider.azure_speech, "user-azure-key", "westeurope")

    resolved = await resolve_provider_key(db_session, stored_user.id, Provider.azure_speech, "/api/tts")

    assert (resolved.value, resolved.region, resolved.source) == ("user-azure-key", "westeurope", KeySource.user)


@pytest.mark.parametrize(
    ("provider", "value", "region"),
    [
        (Provider.openrouter, "env-openrouter-key", None),
        (Provider.azure_speech, "env-azure-key", "eastus"),
        (Provider.google, "env-google-key", None),
    ],
)
async def test_env_fallback_reports_source_env(db_session, stored_user, provider_env, provider, value, region):
    resolved = await resolve_provider_key(db_session, stored_user.id, provider, "/api/x")

    assert (resolved.value, resolved.region, resolved.source) == (value, region, KeySource.env)
    assert await _usage(db_session) == [(provider, KeySource.env, "/api/x")]


@pytest.mark.parametrize(
    ("provider", "unset", "name"),
    [
        (Provider.openrouter, ["openrouter_api_key"], "OpenRouter"),
        (Provider.azure_speech, ["azure_speech_key"], "Azure Speech"),
        (Provider.azure_speech, ["azure_speech_region"], "Azure Speech"),
        (Provider.google, ["google_api_key"], "Google"),
    ],
)
async def test_400_when_neither_key_exists_and_no_usage_is_logged(
    db_session, stored_user, provider_env, monkeypatch, provider, unset, name
):
    for field in unset:
        monkeypatch.setattr(f"app.keys.service.settings.{field}", None)

    with pytest.raises(HTTPException) as raised:
        await resolve_provider_key(db_session, stored_user.id, provider, "/api/x")

    assert raised.value.status_code == 400
    assert raised.value.detail == f"No {name} key configured. Add one in Settings."
    assert await _usage(db_session) == []


async def test_every_call_logs_one_usage_row(db_session, stored_user, provider_env):
    for _ in range(3):
        await resolve_provider_key(db_session, stored_user.id, Provider.openrouter, "/api/x")

    count = await db_session.scalar(select(func.count()).select_from(ProviderUsage))
    assert count == 3


async def test_a_key_saved_under_another_encryption_key_asks_to_save_again(db_session, stored_user):
    foreign = Fernet(Fernet.generate_key()).encrypt(b"old-key")
    db_session.add(ProviderKey(user_id=stored_user.id, provider=Provider.openrouter, ciphertext=foreign))
    await db_session.commit()

    with pytest.raises(HTTPException) as raised:
        await resolve_provider_key(db_session, stored_user.id, Provider.openrouter, "/api/x")

    assert raised.value.status_code == 400
    assert "Save it again in Settings" in raised.value.detail


async def test_resolver_logs_its_timing_without_the_key(db_session, stored_user, provider_env, caplog):
    with caplog.at_level(logging.INFO, logger="app.keys.service"):
        await resolve_provider_key(db_session, stored_user.id, Provider.openrouter, "/api/x")

    [line] = [r.getMessage() for r in caplog.records if r.getMessage().startswith("resolve_provider_key")]
    assert line.startswith("resolve_provider_key provider=openrouter source=env took ")
    float(line.split()[-1])
    assert "env-openrouter-key" not in caplog.text


async def test_the_resolved_key_reaches_openrouter(client, db_session, stored_user, provider_env, respx_mock):
    await _save(db_session, stored_user, Provider.openrouter, "user-openrouter-key")
    sent = {}

    def capture(request: httpx.Request):
        sent["authorization"] = request.headers["authorization"]
        body = {"exercises": [{"story": "今天很好。", "blanks": ["今天"]}]}
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(body)}}]})

    respx_mock.post("https://openrouter.ai/api/v1/chat/completions").mock(side_effect=capture)

    response = await client.post(
        "/api/quiz/generate",
        json={
            "words": [{"word": "今天", "romanization": "jīntiān", "meaning": "today", "usage": "今天很好"}],
            "exercise_type": "cloze",
        },
    )

    assert response.status_code == 200
    assert sent["authorization"] == "Bearer user-openrouter-key"
    assert await _usage(db_session) == [(Provider.openrouter, KeySource.user, "/api/quiz/generate")]
