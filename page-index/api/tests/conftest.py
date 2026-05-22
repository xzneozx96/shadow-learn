import os
import pytest
import asyncio
from typing import AsyncGenerator, Generator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from httpx import AsyncClient, ASGITransport
from api.main import app
from api.config import settings
from api.models.database import Base
from api.dependencies import get_db

# Use a separate test database (override via TEST_DATABASE_URL env for CI/local infra)
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://user:password@localhost/pageindex_test",
)

# Override settings for testing
settings.DATABASE_URL = TEST_DATABASE_URL
settings.API_SECRET_KEY = "test-key"

TEST_AUTH_HEADERS = {"X-API-Key": "test-key"}

@pytest.fixture(scope="function")
async def db_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
        
    yield engine
    
    # Cleanup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest.fixture(scope="function")
async def db_session(db_engine):
    async_session = sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session
        # If the test committed, we don't need to rollback explicitly unless we want to enforce it.
        # But for clean isolation, dropping tables (in db_engine fixture) handles cleanup.
        await session.close()
        
@pytest.fixture(scope="function")
async def client(db_session):
    # Override get_db dependency
    # Note: We need to create a NEW session for the app request to avoid
    # "another operation is in progress" if the test also uses the session concurrently,
    # OR ensure strictly sequential usage.
    # However, overriding with the SAME session allows asserts on the session state in the test.
    # To be safe against concurrency issues, we can let the app create its own session 
    # connected to the same transaction? No, that's complex with async.
    
    # Simplest approach for validation: Let the app use the passed session, assuming sequential execution.
    # If that fails, we might need a text-client that doesn't share the session instance 
    # but shares the DB state.
    
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers=TEST_AUTH_HEADERS,
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
