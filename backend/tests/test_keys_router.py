import pytest
from sqlalchemy import select

from app.keys.crypto import decrypt
from app.keys.models import Provider, ProviderKey

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.usefixtures("stored_user")]


async def test_list_reports_every_provider_without_a_saved_key(client, provider_env, monkeypatch):
    monkeypatch.setattr("app.keys.service.settings.google_api_key", None)
    response = await client.get("/api/keys")
    assert response.status_code == 200
    assert response.json() == [
        {"provider": "openrouter", "source": "env", "last4": None, "region": None},
        {"provider": "azure_speech", "source": "env", "last4": None, "region": None},
        {"provider": "google", "source": "none", "last4": None, "region": None},
    ]


async def test_put_stores_ciphertext_and_get_shows_only_the_last_four(client, db_session, stored_user):
    response = await client.put("/api/keys/openrouter", json={"value": "sk-or-v1-secretab12"})
    assert response.status_code == 200
    assert response.json() == {"provider": "openrouter", "source": "user", "last4": "ab12", "region": None}

    row = await db_session.scalar(select(ProviderKey).where(ProviderKey.user_id == stored_user.id))
    assert b"sk-or-v1-secretab12" not in row.ciphertext
    assert row.ciphertext != b"sk-or-v1-secretab12"
    assert decrypt(row.ciphertext) == "sk-or-v1-secretab12"

    listed = (await client.get("/api/keys")).json()
    assert listed[0] == {"provider": "openrouter", "source": "user", "last4": "ab12", "region": None}
    assert "sk-or-v1-secretab12" not in str(listed)


async def test_put_replaces_an_existing_key(client):
    await client.put("/api/keys/openrouter", json={"value": "first-key-1111"})
    response = await client.put("/api/keys/openrouter", json={"value": "second-key-2222"})
    assert response.json()["last4"] == "2222"


async def test_put_azure_keeps_its_region(client):
    response = await client.put("/api/keys/azure_speech", json={"value": "azure-key-9f3c", "region": "eastus"})
    assert response.status_code == 200
    assert response.json() == {"provider": "azure_speech", "source": "user", "last4": "9f3c", "region": "eastus"}


async def test_put_azure_without_a_region_is_rejected(client):
    response = await client.put("/api/keys/azure_speech", json={"value": "azure-key-9f3c"})
    assert response.status_code == 422


@pytest.mark.parametrize("body", [{"value": ""}, {"value": "   "}, {"value": "k", "extra": 1}])
async def test_put_rejects_invalid_bodies(client, body):
    response = await client.put("/api/keys/openrouter", json=body)
    assert response.status_code == 422


async def test_put_rejects_an_unknown_provider(client):
    response = await client.put("/api/keys/minimax", json={"value": "some-key"})
    assert response.status_code == 422


async def test_delete_falls_back_to_the_env_state(client, provider_env, db_session):
    await client.put("/api/keys/google", json={"value": "AIza-google-7777"})
    response = await client.delete("/api/keys/google")
    assert response.status_code == 204

    assert await db_session.scalar(select(ProviderKey).where(ProviderKey.provider == Provider.google)) is None
    listed = (await client.get("/api/keys")).json()
    assert listed[2] == {"provider": "google", "source": "env", "last4": None, "region": None}


async def test_keys_are_scoped_to_the_signed_in_account(client, db_session, stored_user, signed_in_user):
    from app.accounts.deps import current_active_user
    from app.accounts.models import User
    from app.main import app

    await client.put("/api/keys/openrouter", json={"value": "mine-key-aaaa"})
    other = User(email="other@example.com", hashed_password="", is_active=True, is_superuser=False, is_verified=False)
    db_session.add(other)
    await db_session.commit()
    app.dependency_overrides[current_active_user] = lambda: other

    listed = (await client.get("/api/keys")).json()
    await client.delete("/api/keys/openrouter")

    app.dependency_overrides[current_active_user] = lambda: signed_in_user
    assert listed[0]["source"] != "user"
    assert (await client.get("/api/keys")).json()[0]["last4"] == "aaaa"


async def test_list_survives_a_key_saved_under_another_encryption_key(client, db_session, stored_user):
    from cryptography.fernet import Fernet

    foreign = Fernet(Fernet.generate_key()).encrypt(b"old-openrouter-key")
    db_session.add(ProviderKey(user_id=stored_user.id, provider=Provider.openrouter, ciphertext=foreign))
    await db_session.commit()

    response = await client.get("/api/keys")

    assert response.status_code == 200
    assert response.json()[0] == {"provider": "openrouter", "source": "user", "last4": None, "region": None}
    saved = await client.put("/api/keys/openrouter", json={"value": "new-openrouter-key-5678"})
    assert saved.json()["last4"] == "5678"


async def test_put_lowercases_the_azure_region(client):
    response = await client.put("/api/keys/azure_speech", json={"value": "azure-key-9f3c", "region": " EastUS "})
    assert response.json()["region"] == "eastus"


async def test_put_rejects_a_key_short_enough_to_echo_in_full(client):
    response = await client.put("/api/keys/openrouter", json={"value": "abc123"})
    assert response.status_code == 422
