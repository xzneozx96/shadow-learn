import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

import app.accounts.models
import app.catalog.models
import app.jobs.models
import app.keys.models
import app.lessons.models
import app.media.models
import app.speak.models
import app.userdata.models  # noqa: F401
from alembic import context
from app.db import Base
from app.settings import settings

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    engine = create_async_engine(settings.database_url, poolclass=pool.NullPool)
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


asyncio.run(run_async_migrations())
