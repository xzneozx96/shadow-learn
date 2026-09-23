import pytest
from sqlalchemy import select

from app.keys.crypto import encrypt
from app.keys.models import KeySource, Provider, ProviderKey, ProviderUsage
from app.speak.models import SpeakLiveSession

pytestmark = pytest.mark.asyncio(loop_scope="session")

URL = "/api/internal/speak-sessions/{}/google-key"
TOKEN = "internal-token-for-tests"


@pytest.fixture(autouse=True)
def internal_token(monkeypatch):
    monkeypatch.setattr("app.internal.router.settings.offshore_internal_token", TOKEN)


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer wrong"}, {"Authorization": TOKEN}, {"Authorization": f"Token {TOKEN}"}],
)
async def test_rejects_a_missing_or_wrong_token(client, headers):
    response = await client.get(URL.format("x"), headers=headers)
    assert response.status_code == 401
    assert response.json() == {"detail": "Unauthorized"}


@pytest.mark.real_auth
async def test_rejects_a_user_bearer_token(client, auth_headers):
    response = await client.get(URL.format("x"), headers=auth_headers)
    assert response.status_code == 401


async def test_fails_closed_when_the_server_has_no_token(client, monkeypatch):
    monkeypatch.setattr("app.internal.router.settings.offshore_internal_token", "")
    response = await client.get(URL.format("x"), headers={"Authorization": "Bearer "})
    assert response.status_code == 401


async def test_unknown_session_is_404(client, db_session):
    response = await client.get(URL.format("session-unknown"), headers={"Authorization": f"Bearer {TOKEN}"})
    assert response.status_code == 404


async def test_returns_the_session_owners_key_and_logs_usage(client, db_session, stored_user):
    db_session.add_all([
        ProviderKey(user_id=stored_user.id, provider=Provider.google, ciphertext=encrypt("AIza-user-google")),
        SpeakLiveSession(session_id="session-abc", user_id=stored_user.id),
    ])
    await db_session.commit()

    response = await client.get(URL.format("session-abc"), headers={"Authorization": f"Bearer {TOKEN}"})

    assert response.status_code == 200
    assert response.json() == {"google_key": "AIza-user-google", "source": "user"}
    usage = (await db_session.execute(select(ProviderUsage.provider, ProviderUsage.source, ProviderUsage.endpoint))).all()
    assert [tuple(row) for row in usage] == [
        (Provider.google, KeySource.user, "/api/internal/speak-sessions/{session_id}/google-key")
    ]


async def test_falls_back_to_the_env_google_key(client, db_session, stored_user, provider_env):
    db_session.add(SpeakLiveSession(session_id="session-env", user_id=stored_user.id))
    await db_session.commit()

    response = await client.get(URL.format("session-env"), headers={"Authorization": f"Bearer {TOKEN}"})

    assert response.json() == {"google_key": "env-google-key", "source": "env"}


async def test_an_expired_session_is_404(client, db_session, stored_user, provider_env):
    from datetime import UTC, datetime

    from app.speak.models import SESSION_TTL

    db_session.add(
        SpeakLiveSession(
            session_id="session-old", user_id=stored_user.id, created_at=datetime.now(UTC) - SESSION_TTL - SESSION_TTL / 10
        )
    )
    await db_session.commit()

    response = await client.get(URL.format("session-old"), headers={"Authorization": f"Bearer {TOKEN}"})

    assert response.status_code == 404
