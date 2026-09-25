import hashlib
import json
from pathlib import Path

import pytest
from sqlalchemy import bindparam, select
from sqlalchemy.dialects.postgresql import JSONB

from app.importer.canonical import canonical, store_hash

FIXTURES = json.loads((Path(__file__).parent / "fixtures" / "canonical-fixtures.json").read_text())
CASES = FIXTURES["cases"]


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_python_canonical_matches_the_browser(case):
    assert canonical(case["value"]).decode() == case["canonical"]
    assert hashlib.sha256(canonical(case["value"])).hexdigest() == case["sha256"]


@pytest.mark.asyncio(loop_scope="session")
@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
async def test_canonical_survives_a_jsonb_round_trip(db_session, case):
    stored = await db_session.scalar(select(bindparam("value", case["value"], type_=JSONB)))
    assert canonical(stored).decode() == case["canonical"]


def test_store_hash_matches_the_browser():
    store = FIXTURES["store"]
    records = [(case["name"], case["value"]) for case in CASES]
    assert store_hash(records) == store["sha256"]
    assert len(records) == store["count"]


def test_negative_zero_is_zero():
    assert canonical(-0.0) == b"0"
