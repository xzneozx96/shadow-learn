import asyncio
import os
import uuid
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from alembic.config import Config
from cryptography.fernet import Fernet
from httpx import ASGITransport, AsyncClient
from sqlalchemy import make_url, pool, text
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command

TEST_DATABASE_URL = os.environ.get(
    "SHADOWLEARN_TEST_DATABASE_URL",
    "postgresql+asyncpg://shadowlearn:shadowlearn@127.0.0.1:5435/shadowlearn_test",
)
os.environ["SHADOWLEARN_DATABASE_URL"] = TEST_DATABASE_URL
os.environ["SHADOWLEARN_S3_BUCKET"] = f"shadowlearn-test-{os.getpid()}"
os.environ.setdefault("SHADOWLEARN_JWT_SECRET", "test-access-secret-" + "a" * 32)
os.environ.setdefault("SHADOWLEARN_JWT_REFRESH_SECRET", "test-refresh-secret-" + "b" * 32)
os.environ["SHADOWLEARN_SMTP_HOST"] = ""
os.environ.setdefault("SHADOWLEARN_ENCRYPTION_KEY", Fernet.generate_key().decode())

from app.accounts.deps import current_active_user
from app.accounts.models import User
from app.db import SessionLocal, engine
from app.main import app
from app.settings import settings
from app.storage import create_s3_client, ensure_bucket


@pytest.fixture
def mock_tts_provider():
    """Seed app.state.tts_provider with an AsyncMock for router tests.

    Without this, tests that hit TTS router endpoints will fail with
    AttributeError because the lifespan event doesn't run in test context.
    """
    provider = AsyncMock()
    app.state.tts_provider = provider
    app.state.tts_provider_name = "azure"
    return provider


async def _create_test_database() -> None:
    url = make_url(TEST_DATABASE_URL)
    admin = create_async_engine(
        url.set(database="postgres"), isolation_level="AUTOCOMMIT", poolclass=pool.NullPool
    )
    async with admin.connect() as conn:
        exists = await conn.scalar(
            text("select 1 from pg_database where datname = :name"), {"name": url.database}
        )
        if not exists:
            await conn.execute(text(f'create database "{url.database}"'))
    await admin.dispose()


@pytest.fixture(scope="session")
def migrated_database():
    asyncio.run(_create_test_database())
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).parent.parent / "alembic"))
    command.upgrade(config, "head")


@pytest_asyncio.fixture(loop_scope="session")
async def db_session(migrated_database):
    async with SessionLocal() as session:
        yield session
    async with engine.begin() as conn:
        tables = (
            await conn.scalars(
                text(
                    "select tablename from pg_tables"
                    " where schemaname = 'public' and tablename <> 'alembic_version'"
                )
            )
        ).all()
        if tables:
            names = ", ".join(f'"{name}"' for name in tables)
            await conn.execute(text(f"truncate {names} restart identity cascade"))


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def s3():
    async with create_s3_client(settings) as client:
        await ensure_bucket(client, settings.s3_bucket)
        yield client
        listing = await client.list_objects_v2(Bucket=settings.s3_bucket)
        for obj in listing.get("Contents", []):
            await client.delete_object(Bucket=settings.s3_bucket, Key=obj["Key"])
        await client.delete_bucket(Bucket=settings.s3_bucket)


@pytest.fixture
def app_s3(s3):
    """Lifespan does not run under ASGITransport, so hand the routes the test bucket's client."""
    app.state.s3 = s3
    yield s3
    del app.state.s3


@pytest.fixture(autouse=True)
def signed_in_user(request):
    if request.node.get_closest_marker("real_auth"):
        yield None
        return
    user = User(
        id=uuid.uuid4(),
        email="tester@example.com",
        hashed_password="",
        is_active=True,
        is_superuser=False,
        is_verified=False,
        token_version=0,
    )
    app.dependency_overrides[current_active_user] = lambda: user
    yield user
    app.dependency_overrides.pop(current_active_user, None)


@pytest_asyncio.fixture(loop_scope="session")
async def stored_user(db_session, signed_in_user):
    db_session.add(signed_in_user)
    await db_session.commit()
    return signed_in_user


@pytest.fixture
def provider_env(monkeypatch):
    monkeypatch.setattr(settings, "openrouter_api_key", "env-openrouter-key")
    monkeypatch.setattr(settings, "azure_speech_key", "env-azure-key")
    monkeypatch.setattr(settings, "azure_speech_region", "eastus")
    monkeypatch.setattr(settings, "google_api_key", "env-google-key")


@pytest_asyncio.fixture(loop_scope="session")
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield http


async def register_and_login(client: AsyncClient, email: str, password: str = "correct-horse-1") -> dict:
    created = await client.post("/api/auth/register", json={"email": email, "password": password})
    assert created.status_code == 201, created.text
    login = await client.post("/api/auth/login", data={"username": email, "password": password})
    assert login.status_code == 200, login.text
    return {"id": created.json()["id"], "email": email, "password": password, **login.json()}


@pytest_asyncio.fixture(loop_scope="session")
async def user(db_session, client):
    return await register_and_login(client, f"user-{uuid.uuid4().hex[:8]}@example.com")


@pytest.fixture
def auth_headers(user):
    return {"Authorization": f"Bearer {user['access_token']}"}
