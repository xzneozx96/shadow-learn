import uuid

import pytest
import pytest_asyncio

from app.userdata.specs import STORES
from tests.conftest import register_and_login

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.real_auth]

MASTERY = {"masteryLevel": 1, "confidenceScore": 0.5, "totalPracticeTime": 10, "lastPracticed": None}

SAMPLES = {
    "settings": {"translationLanguage": "vi", "uiLanguage": "en"},
    "vocabulary": {"id": "w1", "word": "你好", "sourceLessonId": "L1", "createdAt": "2026-09-23T00:00:00Z"},
    "learner-profile": {"name": "Ada", "totalSessions": 3, "currentStreakDays": 2, "profileCreated": "2026-01-01"},
    "progress-db": {"totalSessions": 1, "totalExercises": 4, "totalCorrect": 3, "totalIncorrect": 1},
    "mastery-db": {"writing": MASTERY, "speaking": MASTERY},
    "spaced-repetition": {"itemId": "w1", "itemType": "vocabulary", "dueDate": "2026-09-23"},
    "session-logs": {"sessionId": "s1", "date": "2026-09-23", "skillPracticed": "mixed"},
    "mistakes-db": {"patternId": "p1", "frequency": 1, "examples": []},
    "agent-memory": {"id": "m1", "content": "likes tea", "tags": ["food"], "importance": 2},
    "exercise-stats": {"vocabId": "w1", "exerciseType": "cloze", "correct": 1, "total": 2},
    "daily-tasks": {"id": "t1", "title": "Review", "completedDate": None},
    "speak-sessions": {"sessionId": "ss1", "startedAt": "2026-09-23T10:00:00Z", "status": "completed"},
    "shadowing-bests": {"lessonId": "L1", "segmentId": "s1", "score": 80},
    "tip-progress": {"key": "c1:v1", "courseId": "c1", "videoId": "v1", "lastSeenAt": "2026-09-23"},
    "tip-notes": {"videoId": "v1", "id": "n1", "title": "Tones", "source": "freeform"},
    "tip-card-states": {"videoId": "v1", "locale": "en", "states": {"What is a tone?": {"state": "known"}}},
    "word-stories": {"word": "你好", "lang": "vi", "story": "A person greets a child.", "updatedAt": "2026-09-24T00:00:00Z"},
    "user-materials": {"id": "um1", "externalId": "PL1", "skill": "Speaking", "source": "playlist"},
    "threads": {"id": "__global", "surface": "global", "ownerId": None, "messages": [], "updatedAt": 1727000000000},
    "thread-summaries": {"threadId": "__global", "summary": "talked about tea", "tokenBudget": 1000},
}

WRITABLE = [name for name, spec in STORES.items() if spec.client_writable]


@pytest_asyncio.fixture(loop_scope="session")
async def other_headers(db_session, client):
    other = await register_and_login(client, f"other-{uuid.uuid4().hex[:8]}@example.com")
    return {"Authorization": f"Bearer {other['access_token']}"}


async def test_every_writable_store_has_a_sample():
    assert set(SAMPLES) == set(WRITABLE)


@pytest.mark.parametrize("store", WRITABLE)
async def test_crud_roundtrip(client, auth_headers, store):
    data = SAMPLES[store]
    record_id = STORES[store].record_id(data)
    url = f"/api/store/{store}/{record_id}"

    put = await client.put(url, json=data, headers=auth_headers)
    assert put.status_code == 200, put.text
    assert put.json() == data
    assert (await client.get(url, headers=auth_headers)).json() == data
    assert (await client.get(f"/api/store/{store}", headers=auth_headers)).json() == [data]

    assert (await client.delete(url, headers=auth_headers)).status_code == 204
    assert (await client.get(url, headers=auth_headers)).status_code == 404
    assert (await client.get(f"/api/store/{store}", headers=auth_headers)).json() == []


async def test_put_replaces_the_record(client, auth_headers):
    url = "/api/store/vocabulary/w1"
    await client.put(url, json=SAMPLES["vocabulary"], headers=auth_headers)
    updated = {**SAMPLES["vocabulary"], "sourceLessonId": "L2"}
    await client.put(url, json=updated, headers=auth_headers)

    assert (await client.get(url, headers=auth_headers)).json() == updated
    by_lesson = await client.get("/api/store/vocabulary?index=by-lesson&value=L1", headers=auth_headers)
    assert by_lesson.json() == []


async def test_unknown_fields_are_kept(client, auth_headers):
    data = {**SAMPLES["vocabulary"], "futureField": {"x": 1}}
    await client.put("/api/store/vocabulary/w1", json=data, headers=auth_headers)
    assert (await client.get("/api/store/vocabulary/w1", headers=auth_headers)).json() == data


async def _put_all(client, headers, store, records):
    for data in records:
        response = await client.put(f"/api/store/{store}/{STORES[store].record_id(data)}", json=data, headers=headers)
        assert response.status_code == 200, response.text


async def _ids(client, headers, store, query=""):
    response = await client.get(f"/api/store/{store}{query}", headers=headers)
    assert response.status_code == 200, response.text
    return sorted(STORES[store].record_id(data) for data in response.json())


async def test_index_equality(client, auth_headers):
    base = SAMPLES["vocabulary"]
    await _put_all(
        client,
        auth_headers,
        "vocabulary",
        [{**base, "id": "a"}, {**base, "id": "b", "sourceLessonId": "L2"}, {**base, "id": "c"}],
    )
    assert await _ids(client, auth_headers, "vocabulary", "?index=by-lesson&value=L1") == ["a", "c"]


async def test_by_due_with_lte_returns_items_due_by_the_date(client, auth_headers):
    base = SAMPLES["spaced-repetition"]
    await _put_all(
        client,
        auth_headers,
        "spaced-repetition",
        [
            {**base, "itemId": "yesterday", "dueDate": "2026-09-22"},
            {**base, "itemId": "today", "dueDate": "2026-09-23"},
            {**base, "itemId": "tomorrow", "dueDate": "2026-09-24"},
        ],
    )
    query = "?index=by-due&op=lte&value=2026-09-23"
    assert await _ids(client, auth_headers, "spaced-repetition", query) == ["today", "yesterday"]


async def test_multi_entry_tags_index_matches_any_tag(client, auth_headers):
    base = SAMPLES["agent-memory"]
    await _put_all(
        client,
        auth_headers,
        "agent-memory",
        [{**base, "id": "m1", "tags": ["food", "travel"]}, {**base, "id": "m2", "tags": ["work"]}],
    )
    assert await _ids(client, auth_headers, "agent-memory", "?index=tags&value=travel") == ["m1"]


async def test_numeric_index_compares_numbers(client, auth_headers):
    base = SAMPLES["threads"]
    await _put_all(
        client,
        auth_headers,
        "threads",
        [{**base, "id": "old", "updatedAt": 9}, {**base, "id": "new", "updatedAt": 10}],
    )
    assert await _ids(client, auth_headers, "threads", "?index=by-updated&op=lte&value=9") == ["old"]
    bad = await client.get("/api/store/threads?index=by-updated&value=soon", headers=auth_headers)
    assert bad.status_code == 422


async def test_threads_filter_by_surface(client, auth_headers):
    lesson = {"id": "L1", "surface": "lesson", "ownerId": "L1", "updatedAt": 1}
    await _put_all(client, auth_headers, "threads", [lesson, SAMPLES["threads"]])
    assert await _ids(client, auth_headers, "threads", "?index=by-surface&value=global") == ["__global"]


async def test_unknown_index_is_rejected(client, auth_headers):
    response = await client.get("/api/store/vocabulary?index=nope&value=x", headers=auth_headers)
    assert response.status_code == 400
    assert response.json() == {"detail": "unknown index"}


async def test_delete_by_index_removes_only_matching_records(client, auth_headers):
    base = SAMPLES["shadowing-bests"]
    await _put_all(
        client,
        auth_headers,
        "shadowing-bests",
        [{**base, "segmentId": "s1"}, {**base, "segmentId": "s2"}, {**base, "lessonId": "L2"}],
    )
    response = await client.delete("/api/store/shadowing-bests?index=by-lesson&value=L1", headers=auth_headers)
    assert response.json() == {"deleted": 2}
    assert await _ids(client, auth_headers, "shadowing-bests") == ["L2:s1"]


async def test_unknown_store_is_404(client, auth_headers):
    response = await client.get("/api/store/nope", headers=auth_headers)
    assert response.status_code == 404
    assert response.json() == {"detail": "unknown store"}


@pytest.mark.parametrize(
    ("store", "record_id", "data"),
    [
        ("vocabulary", "x", {"id": 5}),
        ("vocabulary", "x", {"id": "x", "sourceLessonId": "L1"}),
        ("agent-memory", "m1", {**SAMPLES["agent-memory"], "importance": 7}),
        ("threads", "t", {"id": "t", "surface": "moon", "ownerId": None, "updatedAt": 1}),
        ("vocabulary", "x", ["not", "an", "object"]),
    ],
)
async def test_wrong_shape_is_422(client, auth_headers, store, record_id, data):
    response = await client.put(f"/api/store/{store}/{record_id}", json=data, headers=auth_headers)
    assert response.status_code == 422, response.text


async def test_path_id_must_match_the_record(client, auth_headers):
    response = await client.put("/api/store/vocabulary/other", json=SAMPLES["vocabulary"], headers=auth_headers)
    assert response.status_code == 422
    singleton = await client.put("/api/store/settings/nope", json=SAMPLES["settings"], headers=auth_headers)
    assert singleton.status_code == 422


async def test_word_stories_in_two_languages_do_not_overwrite_each_other(client, auth_headers):
    vi = {**SAMPLES["word-stories"], "lang": "vi", "story": "Chuyện về 你好"}
    en = {**SAMPLES["word-stories"], "lang": "en", "story": "A story about 你好"}
    for story in (vi, en):
        response = await client.put(f"/api/store/word-stories/你好:{story['lang']}", json=story, headers=auth_headers)
        assert response.status_code == 200, response.text

    listed = (await client.get("/api/store/word-stories", headers=auth_headers)).json()

    assert sorted((s["lang"], s["story"]) for s in listed) == [("en", "A story about 你好"), ("vi", "Chuyện về 你好")]


async def test_another_user_cannot_see_or_delete_the_record(client, auth_headers, other_headers):
    await client.put("/api/store/vocabulary/w1", json=SAMPLES["vocabulary"], headers=auth_headers)

    assert (await client.get("/api/store/vocabulary", headers=other_headers)).json() == []
    assert (await client.get("/api/store/vocabulary/w1", headers=other_headers)).status_code == 404
    await client.delete("/api/store/vocabulary/w1", headers=other_headers)
    await client.delete("/api/store/vocabulary?index=by-lesson&value=L1", headers=other_headers)

    assert (await client.get("/api/store/vocabulary/w1", headers=auth_headers)).json() == SAMPLES["vocabulary"]


async def test_two_users_can_hold_the_same_id(client, auth_headers, other_headers):
    mine = SAMPLES["vocabulary"]
    theirs = {**mine, "word": "再见"}
    await client.put("/api/store/vocabulary/w1", json=mine, headers=auth_headers)
    await client.put("/api/store/vocabulary/w1", json=theirs, headers=other_headers)

    assert (await client.get("/api/store/vocabulary/w1", headers=auth_headers)).json() == mine
    assert (await client.get("/api/store/vocabulary/w1", headers=other_headers)).json() == theirs


async def test_external_id_clash_on_put_is_409(client, auth_headers):
    await client.put("/api/store/user-materials/um1", json=SAMPLES["user-materials"], headers=auth_headers)
    clash = {**SAMPLES["user-materials"], "id": "um2"}
    response = await client.put("/api/store/user-materials/um2", json=clash, headers=auth_headers)
    assert response.status_code == 409


async def test_external_id_is_unique_per_user_only(client, auth_headers, other_headers):
    await client.put("/api/store/user-materials/um1", json=SAMPLES["user-materials"], headers=auth_headers)
    theirs = {**SAMPLES["user-materials"], "id": "um2"}
    response = await client.put("/api/store/user-materials/um2", json=theirs, headers=other_headers)
    assert response.status_code == 200


async def test_import_keeps_the_server_row_on_an_external_id_clash(client, auth_headers):
    first = SAMPLES["user-materials"]
    second = {**first, "id": "um2", "skill": "Grammar"}
    for data in (first, second):
        response = await client.post(
            "/api/store/user-materials/bulk", json={"mode": "import", "records": [data]}, headers=auth_headers
        )
        assert response.status_code == 200, response.text

    assert (await client.get("/api/store/user-materials", headers=auth_headers)).json() == [first]


async def test_bulk_replace_writes_every_record(client, auth_headers):
    records = [{**SAMPLES["vocabulary"], "id": f"w{n}"} for n in range(50)]
    response = await client.post(
        "/api/store/vocabulary/bulk", json={"mode": "replace", "records": records}, headers=auth_headers
    )
    assert response.json() == {"count": 50, "after": None}
    assert len((await client.get("/api/store/vocabulary", headers=auth_headers)).json()) == 50


async def test_bulk_import_of_a_union_store_is_idempotent(client, auth_headers):
    records = [{**SAMPLES["vocabulary"], "id": f"w{n}"} for n in range(50)]
    for _ in range(2):
        response = await client.post(
            "/api/store/vocabulary/bulk", json={"mode": "import", "records": records}, headers=auth_headers
        )
        assert response.json() == {"count": 50, "after": None}
    assert len((await client.get("/api/store/vocabulary", headers=auth_headers)).json()) == 50


async def test_bulk_import_does_not_overwrite_existing_union_records(client, auth_headers):
    server = SAMPLES["vocabulary"]
    await client.put("/api/store/vocabulary/w1", json=server, headers=auth_headers)
    await client.post(
        "/api/store/vocabulary/bulk",
        json={"mode": "import", "records": [{**server, "word": "changed"}]},
        headers=auth_headers,
    )
    assert (await client.get("/api/store/vocabulary/w1", headers=auth_headers)).json() == server


async def test_bulk_rejects_the_batch_when_one_record_is_bad(client, auth_headers):
    records = [SAMPLES["vocabulary"], {"id": 5}]
    response = await client.post(
        "/api/store/vocabulary/bulk", json={"mode": "replace", "records": records}, headers=auth_headers
    )
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"][:3] == ["body", "records", 1]
    assert (await client.get("/api/store/vocabulary", headers=auth_headers)).json() == []


async def test_bulk_with_no_records_is_a_no_op(client, auth_headers):
    response = await client.post(
        "/api/store/progress-db/bulk", json={"mode": "import", "records": []}, headers=auth_headers
    )
    assert response.json() == {"count": 0, "after": None}


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("PUT", "/api/store/speak-custom-situations/custom_x"),
        ("DELETE", "/api/store/speak-custom-situations/custom_x"),
        ("DELETE", "/api/store/speak-custom-situations?index=x&value=y"),
        ("POST", "/api/store/speak-custom-situations/bulk"),
    ],
)
async def test_custom_situations_are_read_only_over_the_store_api(client, auth_headers, method, path):
    response = await client.request(method, path, json={"mode": "replace", "records": []}, headers=auth_headers)
    assert response.status_code == 405
