import logging
import re

import pytest

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.real_auth]


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_register_returns_the_new_user(client, db_session):
    response = await client.post(
        "/api/auth/register", json={"email": "new@example.com", "password": "correct-horse-1"}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "new@example.com"
    assert "hashed_password" not in body


async def test_register_rejects_a_short_password(client, db_session):
    response = await client.post("/api/auth/register", json={"email": "short@example.com", "password": "short"})
    assert response.status_code == 400


async def test_login_returns_an_access_and_refresh_pair(client, user):
    assert user["token_type"] == "bearer"
    assert user["access_token"] != user["refresh_token"]


async def test_login_rejects_a_wrong_password(client, user):
    response = await client.post("/api/auth/login", data={"username": user["email"], "password": "wrong-password"})
    assert response.status_code == 400


async def test_me_accepts_the_access_token(client, user):
    response = await client.get("/api/users/me", headers=_bearer(user["access_token"]))
    assert response.status_code == 200
    assert response.json()["id"] == user["id"]


async def test_me_rejects_the_refresh_token(client, user):
    response = await client.get("/api/users/me", headers=_bearer(user["refresh_token"]))
    assert response.status_code == 401


async def test_refresh_mints_a_working_pair(client, user):
    response = await client.post("/api/auth/refresh", json={"refresh_token": user["refresh_token"]})
    assert response.status_code == 200
    me = await client.get("/api/users/me", headers=_bearer(response.json()["access_token"]))
    assert me.json()["id"] == user["id"]


async def test_refresh_rejects_an_access_token(client, user):
    response = await client.post("/api/auth/refresh", json={"refresh_token": user["access_token"]})
    assert response.status_code == 401


async def test_reset_password_revokes_old_tokens(client, user, caplog):
    with caplog.at_level(logging.INFO, logger="app.accounts.email"):
        forgot = await client.post("/api/auth/forgot-password", json={"email": user["email"]})
    assert forgot.status_code == 202
    token = re.search(r"reset-password\?token=(\S+)", caplog.text).group(1)

    reset = await client.post("/api/auth/reset-password", json={"token": token, "password": "new-password-2"})
    assert reset.status_code == 200

    stale_refresh = await client.post("/api/auth/refresh", json={"refresh_token": user["refresh_token"]})
    assert stale_refresh.status_code == 401
    stale_access = await client.get("/api/users/me", headers=_bearer(user["access_token"]))
    assert stale_access.status_code == 401
    old_password = await client.post("/api/auth/login", data={"username": user["email"], "password": user["password"]})
    assert old_password.status_code == 400
    new_login = await client.post("/api/auth/login", data={"username": user["email"], "password": "new-password-2"})
    assert new_login.status_code == 200
