import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext

import app.accounts.models
import app.keys.models
import app.speak.models  # noqa: F401
from app.db import Base, engine

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_migrated_schema_matches_the_models(migrated_database):
    async with engine.connect() as conn:
        diff = await conn.run_sync(lambda sync: compare_metadata(MigrationContext.configure(sync), Base.metadata))
    assert diff == []
