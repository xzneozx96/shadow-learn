import re

import pytest
from pydantic import BaseModel

from app.userdata.models import TABLES
from app.userdata.specs import STORES

INDEXEDDB_STORES = {
    "settings",
    "vocabulary",
    "learner-profile",
    "progress-db",
    "mastery-db",
    "spaced-repetition",
    "session-logs",
    "mistakes-db",
    "agent-memory",
    "exercise-stats",
    "daily-tasks",
    "speak-sessions",
    "shadowing-bests",
    "tip-progress",
    "tip-notes",
    "user-materials",
    "threads",
    "thread-summaries",
}


def _json_keys(schema) -> set[str]:
    return {field.alias or name for name, field in schema.model_fields.items()}


SERVER_ONLY_STORES = {"speak-custom-situations", "tip-card-states", "word-stories"}


def test_registry_holds_the_indexeddb_stores_plus_server_only_stores():
    assert len(STORES) == 21
    assert set(STORES) == INDEXEDDB_STORES | SERVER_ONLY_STORES


@pytest.mark.parametrize("spec", STORES.values(), ids=STORES.keys())
def test_spec_names_a_userdata_table(spec):
    assert re.fullmatch(r"userdata_[a-z_]+", spec.table)
    assert TABLES[spec.name].name == spec.table


def test_every_store_has_its_own_schema():
    schemas = [spec.schema for spec in STORES.values()]
    assert len(set(schemas)) == len(schemas)


@pytest.mark.parametrize("spec", STORES.values(), ids=STORES.keys())
def test_indexed_and_key_paths_exist_in_the_schema(spec):
    keys = _json_keys(spec.schema)
    assert {field.json_path for field in spec.indexed} <= keys
    assert set(spec.key_path) <= keys


@pytest.mark.parametrize("spec", STORES.values(), ids=STORES.keys())
def test_spec_has_exactly_one_id_source(spec):
    assert bool(spec.key_path) != (spec.singleton_id is not None)


@pytest.mark.parametrize(
    ("store", "record_id"),
    [("settings", "settings"), ("progress-db", "global"), ("mastery-db", "global"), ("learner-profile", "profile")],
)
def test_singletons_keep_the_fixed_ids_the_client_uses(store, record_id):
    assert STORES[store].record_id({}) == record_id


@pytest.mark.parametrize(
    ("store", "data", "record_id"),
    [
        ("shadowing-bests", {"lessonId": "L1", "segmentId": "s1"}, "L1:s1"),
        ("tip-notes", {"videoId": "v1", "id": "n1"}, "v1:n1"),
        ("exercise-stats", {"vocabId": "w1", "exerciseType": "cloze"}, "w1:cloze"),
    ],
)
def test_composite_keys_join_with_a_colon(store, data, record_id):
    assert STORES[store].record_id(data) == record_id


@pytest.mark.parametrize("spec", [spec for spec in STORES.values() if spec.client_writable], ids=lambda spec: spec.name)
def test_only_key_and_indexed_fields_are_required(spec):
    required = {field.alias or name for name, field in spec.schema.model_fields.items() if field.is_required()}
    assert required == set(spec.key_path) | {field.json_path for field in spec.indexed}


def _nested_models(model, seen=None):
    seen = set() if seen is None else seen
    for field in model.model_fields.values():
        for arg in (field.annotation, *getattr(field.annotation, "__args__", ())):
            for inner in (arg, *getattr(arg, "__args__", ())):
                if isinstance(inner, type) and issubclass(inner, BaseModel) and inner not in seen:
                    seen.add(inner)
                    _nested_models(inner, seen)
    return seen


NESTED_KEYS = {"DailyAccuracy": {"date"}}


@pytest.mark.parametrize("spec", [spec for spec in STORES.values() if spec.client_writable], ids=lambda spec: spec.name)
def test_nested_records_require_only_their_key(spec):
    for model in _nested_models(spec.schema):
        required = {field.alias or name for name, field in model.model_fields.items() if field.is_required()}
        assert required == NESTED_KEYS.get(model.__name__, set()), model.__name__
