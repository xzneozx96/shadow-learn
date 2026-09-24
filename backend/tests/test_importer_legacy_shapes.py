import json
from pathlib import Path

import pytest

from app.importer.canonical import canonical
from app.importer.router import ImportedLesson
from app.userdata.specs import STORES

EXPORT = json.loads((Path(__file__).parent / "fixtures" / "legacy-export.json").read_text())
RECORDS = [(store, record) for store, records in EXPORT["stores"].items() for record in records]


def test_the_export_covers_every_client_writable_store():
    assert set(EXPORT["stores"]) == {name for name, spec in STORES.items() if spec.client_writable}
    assert all(EXPORT["stores"][name] for name in EXPORT["stores"]), "every store needs a legacy sample"


@pytest.mark.parametrize(("store", "record"), RECORDS, ids=[f"{store}:{record['id']}" for store, record in RECORDS])
def test_validation_keeps_the_legacy_record_byte_for_byte(store, record):
    spec = STORES[store]
    stored = spec.validate(record["data"])
    assert canonical(stored) == canonical(record["data"])
    assert spec.record_id(stored) == record["id"]


@pytest.mark.parametrize("lesson", EXPORT["lessons"], ids=[lesson["id"] for lesson in EXPORT["lessons"]])
def test_every_exported_lesson_is_accepted(lesson):
    ImportedLesson.model_validate({**lesson["lesson"], "segments": lesson["segments"]})
