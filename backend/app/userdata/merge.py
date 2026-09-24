from collections.abc import Callable
from typing import Any, get_args

from app.userdata.schemas import Skill

Data = dict[str, Any]
MergeRule = Callable[[Data, Data], Data]

MAX_MISTAKE_EXAMPLES = 20
SKILLS = frozenset(get_args(Skill))


def union(server: Data, incoming: Data) -> Data:
    return server


def keep_server(server: Data, incoming: Data) -> Data:
    return server


def _sum(server: Data, incoming: Data, key: str) -> int | float:
    return (server.get(key) or 0) + (incoming.get(key) or 0)


def _latest(a: str | None, b: str | None) -> str | None:
    return max(a, b) if a and b else a or b


def _earliest(a: str | None, b: str | None) -> str | None:
    return min(a, b) if a and b else a or b


def learner_profile(server: Data, incoming: Data) -> Data:
    return {
        **server,
        "currentStreakDays": _max(server, incoming, "currentStreakDays"),
        "totalSessions": _sum(server, incoming, "totalSessions"),
        "totalStudyMinutes": _sum(server, incoming, "totalStudyMinutes"),
        "lastStudyDate": _latest(server.get("lastStudyDate"), incoming.get("lastStudyDate")),
        "profileCreated": _earliest(server.get("profileCreated"), incoming.get("profileCreated")),
    }


def _max(server: Data, incoming: Data, key: str) -> int | float:
    return max(server.get(key) or 0, incoming.get(key) or 0)


def _skill_stats(server: Data, incoming: Data) -> Data:
    sessions = _sum(server, incoming, "sessions")
    weighted = sum((side.get("accuracy") or 0) * (side.get("sessions") or 0) for side in (server, incoming))
    return {
        **server,
        "sessions": sessions,
        "accuracy": weighted / sessions if sessions else server.get("accuracy"),
        "lastPracticed": _latest(server.get("lastPracticed"), incoming.get("lastPracticed")),
    }


def _per_skill(server: Data, incoming: Data, merge_skill: MergeRule) -> Data:
    merged = {**incoming, **{key: value for key, value in server.items() if value is not None}}
    for skill in SKILLS & server.keys() & incoming.keys():
        if server[skill] is not None and incoming[skill] is not None:
            merged[skill] = merge_skill(server[skill], incoming[skill])
    return merged


def progress(server: Data, incoming: Data) -> Data:
    counters = ("totalSessions", "totalExercises", "totalCorrect", "totalIncorrect", "totalStudyMinutes")
    merged = {**server, **{key: _sum(server, incoming, key) for key in counters}}
    merged["accuracyRate"] = merged["totalCorrect"] / merged["totalExercises"] if merged["totalExercises"] else 0

    trend = {day["date"]: day for day in server.get("accuracyTrend") or []}
    for day in incoming.get("accuracyTrend") or []:
        if day["date"] not in trend or (day.get("exercises") or 0) > (trend[day["date"]].get("exercises") or 0):
            trend[day["date"]] = day
    merged["accuracyTrend"] = [trend[date] for date in sorted(trend)]

    merged["skillProgress"] = _per_skill(
        server.get("skillProgress") or {}, incoming.get("skillProgress") or {}, _skill_stats
    )
    return merged


def _skill_mastery(server: Data, incoming: Data) -> Data:
    return {
        **server,
        "masteryLevel": _max(server, incoming, "masteryLevel"),
        "confidenceScore": _max(server, incoming, "confidenceScore"),
        "totalPracticeTime": _sum(server, incoming, "totalPracticeTime"),
        "lastPracticed": _latest(server.get("lastPracticed"), incoming.get("lastPracticed")),
    }


def mastery(server: Data, incoming: Data) -> Data:
    return _per_skill(server, incoming, _skill_mastery)


def exercise_stat(server: Data, incoming: Data) -> Data:
    return {
        **server,
        "correct": _sum(server, incoming, "correct"),
        "total": _sum(server, incoming, "total"),
        "lastAttempt": _latest(server.get("lastAttempt"), incoming.get("lastAttempt")),
    }


def mistake(server: Data, incoming: Data) -> Data:
    examples = [*(server.get("examples") or []), *(incoming.get("examples") or [])]
    return {
        **server,
        "frequency": _sum(server, incoming, "frequency"),
        "lastOccurred": _latest(server.get("lastOccurred"), incoming.get("lastOccurred")),
        "examples": examples[-MAX_MISTAKE_EXAMPLES:],
    }


def higher_score(server: Data, incoming: Data) -> Data:
    return incoming if (incoming.get("score") or 0) > (server.get("score") or 0) else server


def later_seen(server: Data, incoming: Data) -> Data:
    return incoming if (incoming.get("lastSeenAt") or "") > (server.get("lastSeenAt") or "") else server


def later_updated(server: Data, incoming: Data) -> Data:
    return incoming if (incoming.get("updatedAt") or "") > (server.get("updatedAt") or "") else server


def card_states(server: Data, incoming: Data) -> Data:
    states = dict(server.get("states") or {})
    for front, card in (incoming.get("states") or {}).items():
        if front not in states or later_updated(states[front], card) is card:
            states[front] = card
    return {**server, "states": states}
