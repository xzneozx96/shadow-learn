import asyncio
import os
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from alembic.config import Config
from sqlalchemy import make_url, pool, text
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command

TEST_DATABASE_URL = os.environ.get(
    "SHADOWLEARN_TEST_DATABASE_URL",
    "postgresql+asyncpg://shadowlearn:shadowlearn@127.0.0.1:5435/shadowlearn_test",
)
os.environ["SHADOWLEARN_DATABASE_URL"] = TEST_DATABASE_URL
os.environ["SHADOWLEARN_S3_BUCKET"] = f"shadowlearn-test-{os.getpid()}"

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
