import pytest

from app.userdata import merge
from app.userdata.specs import STORES


def _skill(sessions, accuracy, last):
    return {"sessions": sessions, "accuracy": accuracy, "lastPracticed": last}


def _mastery(level, confidence, time, last):
    return {"masteryLevel": level, "confidenceScore": confidence, "totalPracticeTime": time, "lastPracticed": last}


def test_union_and_keep_server_keep_the_stored_record():
    assert merge.union({"a": 1}, {"a": 2}) == {"a": 1}
    assert merge.keep_server({"a": 1}, {"a": 2}) == {"a": 1}


def test_learner_profile():
    server = {
        "name": "Server",
        "nativeLanguage": "vi",
        "targetLanguage": "zh-CN",
        "currentLevel": "HSK 2",
        "currentStreakDays": 5,
        "totalSessions": 3,
        "totalStudyMinutes": 40,
        "lastStudyDate": "2026-09-20",
        "profileCreated": "2026-02-01",
    }
    incoming = {
        "name": "Device",
        "nativeLanguage": "en",
        "targetLanguage": "ja",
        "currentLevel": "N5",
        "currentStreakDays": 9,
        "totalSessions": 4,
        "totalStudyMinutes": 15.5,
        "lastStudyDate": "2026-09-22",
        "profileCreated": "2026-01-01",
    }
    assert merge.learner_profile(server, incoming) == {
        "name": "Server",
        "nativeLanguage": "vi",
        "targetLanguage": "zh-CN",
        "currentLevel": "HSK 2",
        "currentStreakDays": 9,
        "totalSessions": 7,
        "totalStudyMinutes": 55.5,
        "lastStudyDate": "2026-09-22",
        "profileCreated": "2026-01-01",
    }


def test_learner_profile_takes_the_known_date_over_null():
    merged = merge.learner_profile({"lastStudyDate": None}, {"lastStudyDate": "2026-09-22"})
    assert merged["lastStudyDate"] == "2026-09-22"


def test_progress():
    server = {
        "totalSessions": 2,
        "totalExercises": 10,
        "totalCorrect": 8,
        "totalIncorrect": 2,
        "accuracyRate": 0.8,
        "totalStudyMinutes": 30,
        "accuracyTrend": [
            {"date": "2026-09-20", "accuracy": 0.9, "exercises": 5},
            {"date": "2026-09-21", "accuracy": 0.5, "exercises": 2},
        ],
        "skillProgress": {"writing": _skill(2, 0.9, "2026-09-20"), "reading": _skill(1, 1.0, "2026-09-19")},
    }
    incoming = {
        "totalSessions": 1,
        "totalExercises": 10,
        "totalCorrect": 2,
        "totalIncorrect": 8,
        "accuracyRate": 0.2,
        "totalStudyMinutes": 5,
        "accuracyTrend": [
            {"date": "2026-09-21", "accuracy": 0.25, "exercises": 4},
            {"date": "2026-09-19", "accuracy": 1.0, "exercises": 1},
            {"date": "2026-09-20", "accuracy": 0.1, "exercises": 5},
        ],
        "skillProgress": {"writing": _skill(3, 0.4, "2026-09-22"), "speaking": _skill(1, 0.5, None)},
    }
    assert merge.progress(server, incoming) == {
        "totalSessions": 3,
        "totalExercises": 20,
        "totalCorrect": 10,
        "totalIncorrect": 10,
        "accuracyRate": 0.5,
        "totalStudyMinutes": 35,
        "accuracyTrend": [
            {"date": "2026-09-19", "accuracy": 1.0, "exercises": 1},
            {"date": "2026-09-20", "accuracy": 0.9, "exercises": 5},
            {"date": "2026-09-21", "accuracy": 0.25, "exercises": 4},
        ],
        "skillProgress": {
            "writing": _skill(5, pytest.approx(0.6), "2026-09-22"),
            "reading": _skill(1, 1.0, "2026-09-19"),
            "speaking": _skill(1, 0.5, None),
        },
    }


def test_progress_accuracy_is_zero_without_exercises():
    assert merge.progress({}, {})["accuracyRate"] == 0


def test_mastery():
    server = {"writing": _mastery(3, 0.9, 100, "2026-09-20"), "reading": _mastery(1, 0.1, 5, None)}
    incoming = {"writing": _mastery(4, 0.5, 20, "2026-09-18"), "speaking": _mastery(2, 0.4, 7, "2026-09-01")}
    assert merge.mastery(server, incoming) == {
        "writing": _mastery(4, 0.9, 120, "2026-09-20"),
        "reading": _mastery(1, 0.1, 5, None),
        "speaking": _mastery(2, 0.4, 7, "2026-09-01"),
    }


def test_exercise_stat():
    server = {"vocabId": "w1", "exerciseType": "cloze", "correct": 3, "total": 5, "lastAttempt": "2026-09-22"}
    incoming = {"vocabId": "w1", "exerciseType": "cloze", "correct": 1, "total": 4, "lastAttempt": "2026-09-01"}
    assert merge.exercise_stat(server, incoming) == {**server, "correct": 4, "total": 9, "lastAttempt": "2026-09-22"}


def test_mistake_concatenates_examples_capped_at_twenty():
    def examples(prefix, count):
        return [{"userAnswer": f"{prefix}{n}", "correctAnswer": "x", "date": "2026-09-01"} for n in range(count)]

    server = {"patternId": "p", "frequency": 12, "lastOccurred": "2026-09-10", "examples": examples("s", 12)}
    incoming = {"patternId": "p", "frequency": 10, "lastOccurred": "2026-09-12", "examples": examples("d", 10)}
    merged = merge.mistake(server, incoming)

    assert merged["frequency"] == 22
    assert merged["lastOccurred"] == "2026-09-12"
    assert merged["examples"] == (examples("s", 12) + examples("d", 10))[-20:]


@pytest.mark.parametrize(("server", "incoming", "kept"), [(80, 90, "incoming"), (90, 80, "server"), (80, 80, "server")])
def test_shadowing_best_keeps_the_higher_score(server, incoming, kept):
    records = {"server": {"score": server, "from": "server"}, "incoming": {"score": incoming, "from": "incoming"}}
    assert merge.higher_score(records["server"], records["incoming"]) == records[kept]


@pytest.mark.parametrize(
    ("server", "incoming", "kept"),
    [("2026-09-01", "2026-09-02", "incoming"), ("2026-09-02", "2026-09-01", "server"), ("2026-09-01", None, "server")],
)
def test_tip_progress_keeps_the_later_visit(server, incoming, kept):
    records = {"server": {"lastSeenAt": server}, "incoming": {"lastSeenAt": incoming}}
    assert merge.later_seen(records["server"], records["incoming"]) == records[kept]


def test_word_story_keeps_the_later_edit():
    older = {"word": "你", "story": "a", "updatedAt": "2026-09-01"}
    newer = {"word": "你", "story": "b", "updatedAt": "2026-09-02"}
    assert merge.later_updated(older, newer) == newer
    assert merge.later_updated(newer, older) == newer


def test_card_states_keep_the_newest_mark_per_card():
    server = {
        "videoId": "v",
        "locale": "en",
        "states": {
            "a": {"state": "known", "updatedAt": "2026-09-02"},
            "b": {"state": "learning", "updatedAt": "2026-09-01"},
        },
    }
    incoming = {
        "videoId": "v",
        "locale": "en",
        "states": {
            "a": {"state": "learning", "updatedAt": "2026-09-01"},
            "b": {"state": "known", "updatedAt": "2026-09-03"},
            "c": {"state": "new", "updatedAt": "2026-09-01"},
        },
    }
    assert merge.card_states(server, incoming)["states"] == {
        "a": {"state": "known", "updatedAt": "2026-09-02"},
        "b": {"state": "known", "updatedAt": "2026-09-03"},
        "c": {"state": "new", "updatedAt": "2026-09-01"},
    }


def test_rules_are_assigned_per_store():
    rules = {name: spec.merge for name, spec in STORES.items() if spec.merge is not merge.union}
    assert rules == {
        "settings": merge.keep_server,
        "learner-profile": merge.learner_profile,
        "progress-db": merge.progress,
        "mastery-db": merge.mastery,
        "exercise-stats": merge.exercise_stat,
        "mistakes-db": merge.mistake,
        "shadowing-bests": merge.higher_score,
        "tip-progress": merge.later_seen,
        "tip-card-states": merge.card_states,
        "word-stories": merge.later_updated,
    }


IMPORTS = {
    "settings": [{"translationLanguage": "vi"}, {"translationLanguage": "en"}],
    "learner-profile": [{"name": "A", "totalSessions": 3, "currentStreakDays": 2}, {"totalSessions": 4}],
    "progress-db": [
        {"totalSessions": 1, "totalExercises": 4, "totalCorrect": 3, "totalIncorrect": 1},
        {"totalSessions": 2, "totalExercises": 4, "totalCorrect": 1, "totalIncorrect": 3},
    ],
    "mastery-db": [{"writing": _mastery(1, 0.5, 10, None)}, {"writing": _mastery(2, 0.1, 5, "2026-09-01")}],
    "exercise-stats": [
        {"vocabId": "w", "exerciseType": "cloze", "correct": 1, "total": 2},
        {"vocabId": "w", "exerciseType": "cloze", "correct": 2, "total": 2},
    ],
    "mistakes-db": [
        {"patternId": "p", "frequency": 1, "examples": [{"userAnswer": "a", "correctAnswer": "b", "date": "d"}]},
        {"patternId": "p", "frequency": 2, "examples": []},
    ],
    "shadowing-bests": [{"lessonId": "L", "segmentId": "s", "score": 50}, {"lessonId": "L", "segmentId": "s", "score": 70}],
    "tip-progress": [
        {"key": "c:v", "courseId": "c", "videoId": "v", "lastSeenAt": "2026-09-01"},
        {"key": "c:v", "courseId": "c", "videoId": "v", "lastSeenAt": "2026-09-02"},
    ],
    "tip-card-states": [
        {"videoId": "v", "locale": "en", "states": {"a": {"state": "known", "updatedAt": "2026-09-01"}}},
        {"videoId": "v", "locale": "en", "states": {"b": {"state": "learning", "updatedAt": "2026-09-02"}}},
    ],
    "word-stories": [
        {"word": "你", "story": "a", "updatedAt": "2026-09-01"},
        {"word": "你", "story": "b", "updatedAt": "2026-09-02"},
    ],
}


async def _import(client, headers, store, records):
    response = await client.post(f"/api/store/{store}/bulk", json={"mode": "import", "records": records}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_every_merging_store_has_an_import_fixture():
    assert set(IMPORTS) == {name for name, spec in STORES.items() if spec.merge is not merge.union}


@pytest.mark.parametrize("store", IMPORTS)
@pytest.mark.asyncio(loop_scope="session")
@pytest.mark.real_auth
async def test_importing_the_same_batch_twice_changes_nothing(client, auth_headers, store):
    first = await _import(client, auth_headers, store, IMPORTS[store])
    second = await _import(client, auth_headers, store, IMPORTS[store])

    assert first["count"] == second["count"] == 2
    assert first["after"] == second["after"]
    listed = (await client.get(f"/api/store/{store}", headers=auth_headers)).json()
    assert listed == first["after"]


@pytest.mark.parametrize("store", IMPORTS)
@pytest.mark.asyncio(loop_scope="session")
@pytest.mark.real_auth
async def test_import_returns_the_folded_record(client, auth_headers, store):
    spec = STORES[store]
    older, newer = (spec.validate(record) for record in IMPORTS[store])
    body = await _import(client, auth_headers, store, IMPORTS[store])
    assert body["after"] == [spec.merge(older, newer)]


@pytest.mark.asyncio(loop_scope="session")
@pytest.mark.real_auth
async def test_separate_profile_imports_sum_their_sessions(client, auth_headers):
    await _import(client, auth_headers, "learner-profile", [{"totalSessions": 3, "currentStreakDays": 2}])
    await _import(client, auth_headers, "learner-profile", [{"totalSessions": 4, "currentStreakDays": 6}])

    profile = (await client.get("/api/store/learner-profile/profile", headers=auth_headers)).json()
    assert profile["totalSessions"] == 7
    assert profile["currentStreakDays"] == 6


@pytest.mark.asyncio(loop_scope="session")
@pytest.mark.real_auth
async def test_import_merges_into_a_record_written_by_put(client, auth_headers):
    stat = {"vocabId": "w", "exerciseType": "cloze", "correct": 1, "total": 1}
    await client.put("/api/store/exercise-stats/w:cloze", json=stat, headers=auth_headers)
    await _import(client, auth_headers, "exercise-stats", [{**stat, "correct": 0, "total": 3}])

    stored = (await client.get("/api/store/exercise-stats/w:cloze", headers=auth_headers)).json()
    assert (stored["correct"], stored["total"]) == (1, 4)


def test_mastery_leaves_unknown_top_level_fields_to_the_server():
    server = {"writing": _mastery(1, 0.1, 5, None), "note": {"a": 1}, "speaking": None}
    incoming = {"writing": _mastery(2, 0.2, 5, None), "note": {"b": 2}, "speaking": _mastery(1, 0.5, 3, None)}
    merged = merge.mastery(server, incoming)
    assert merged["note"] == {"a": 1}
    assert merged["writing"] == _mastery(2, 0.2, 10, None)
    assert merged["speaking"] == _mastery(1, 0.5, 3, None)


def test_legacy_nested_records_validate_and_merge():
    progress = STORES["progress-db"]
    server = progress.validate({"accuracyTrend": [{"date": "2026-09-01"}], "skillProgress": {"writing": {}}})
    incoming = progress.validate(
        {"accuracyTrend": [{"date": "2026-09-01", "exercises": 2}], "skillProgress": {"writing": {"sessions": 2}}}
    )
    merged = merge.progress(server, incoming)
    assert merged["accuracyTrend"] == [{"date": "2026-09-01", "exercises": 2}]
    assert merged["skillProgress"]["writing"]["sessions"] == 2

    mastery = STORES["mastery-db"]
    merged = merge.mastery(mastery.validate({"writing": {}}), mastery.validate({"writing": {"totalPracticeTime": 4}}))
    assert merged["writing"]["totalPracticeTime"] == 4

    STORES["mistakes-db"].validate({"patternId": "p", "examples": [{"userAnswer": "a"}]})
    STORES["speak-sessions"].validate({"sessionId": "s", "startedAt": "t", "transcript": [{"content": "hi"}]})
