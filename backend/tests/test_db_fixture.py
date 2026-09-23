import pytest
from sqlalchemy import text

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_db_session_round_trips_a_row(db_session):
    await db_session.execute(text("create table throwaway (id int primary key, note text)"))
    await db_session.execute(text("insert into throwaway values (1, 'hello')"))

    row = (await db_session.execute(text("select id, note from throwaway"))).one()

    assert tuple(row) == (1, "hello")
