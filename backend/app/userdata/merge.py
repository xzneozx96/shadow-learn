from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, get_args

from app.userdata.schemas import Skill

Data = dict[str, Any]
MergeRule = Callable[[Data, Data], Data]
Dominance = Callable[[Data, Data], bool]
Delta = Callable[[Data, Data], Data]

MAX_MISTAKE_EXAMPLES = 20
SKILLS = frozenset(get_args(Skill))


def union(server: Data, incoming: Data) -> Data:
    return server


def keep_server(server: Data, incoming: Data) -> Data:
    return server


def _latest(a: str | None, b: str | None) -> str | None:
    return max(a, b) if a and b else a or b


def _earliest(a: str | None, b: str | None) -> str | None:
    return min(a, b) if a and b else a or b


def _at_least(stored: Data, local: Data, key: str) -> bool:
    return local.get(key) is None or (stored.get(key) is not None and stored[key] >= local[key])


@dataclass(frozen=True)
class Fold:
    """The fields a counting rule adds, maxes, or dates, so merge, dominance, and delta share one list."""

    sums: tuple[str, ...] = ()
    maxes: tuple[str, ...] = ()
    latest: tuple[str, ...] = ()
    earliest: tuple[str, ...] = ()

    def merge(self, server: Data, incoming: Data) -> Data:
        return {
            **server,
            **{key: (server.get(key) or 0) + (incoming.get(key) or 0) for key in self.sums},
            **{key: max(server.get(key) or 0, incoming.get(key) or 0) for key in self.maxes},
            **{key: _latest(server.get(key), incoming.get(key)) for key in self.latest},
            **{key: _earliest(server.get(key), incoming.get(key)) for key in self.earliest},
        }

    def dominates(self, stored: Data, local: Data) -> bool:
        return (
            all((stored.get(key) or 0) >= (local.get(key) or 0) for key in (*self.sums, *self.maxes))
            and all(not local.get(key) or _at_least(stored, local, key) for key in self.latest)
            and all(not local.get(key) or bool(stored.get(key)) and stored[key] <= local[key] for key in self.earliest)
        )

    def delta(self, incoming: Data, previous: Data) -> Data:
        return {**incoming, **{key: (incoming.get(key) or 0) - (previous.get(key) or 0) for key in self.sums}}


PROFILE = Fold(
    sums=("totalSessions", "totalStudyMinutes"),
    maxes=("currentStreakDays",),
    latest=("lastStudyDate",),
    earliest=("profileCreated",),
)
PROGRESS = Fold(sums=("totalSessions", "totalExercises", "totalCorrect", "totalIncorrect", "totalStudyMinutes"))
SKILL_STATS = Fold(sums=("sessions",), latest=("lastPracticed",))
SKILL_MASTERY = Fold(sums=("totalPracticeTime",), maxes=("masteryLevel", "confidenceScore"), latest=("lastPracticed",))
EXERCISE_STAT = Fold(sums=("correct", "total"), latest=("lastAttempt",))
MISTAKE = Fold(sums=("frequency",), latest=("lastOccurred",))


def learner_profile(server: Data, incoming: Data) -> Data:
    return PROFILE.merge(server, incoming)


def _skill_stats(server: Data, incoming: Data) -> Data:
    merged = SKILL_STATS.merge(server, incoming)
    weighted = sum((side.get("accuracy") or 0) * (side.get("sessions") or 0) for side in (server, incoming))
    merged["accuracy"] = weighted / merged["sessions"] if merged["sessions"] else server.get("accuracy")
    return merged


def _per_skill(server: Data, incoming: Data, merge_skill: MergeRule) -> Data:
    merged = {**incoming, **{key: value for key, value in server.items() if value is not None}}
    for skill in SKILLS & server.keys() & incoming.keys():
        if server[skill] is not None and incoming[skill] is not None:
            merged[skill] = merge_skill(server[skill], incoming[skill])
    return merged


def _per_skill_dominates(stored: Data, local: Data, fold: Fold) -> bool:
    return all(
        stored.get(skill) is not None and fold.dominates(stored[skill], local[skill])
        for skill in SKILLS & local.keys()
        if local[skill] is not None
    )


def _per_skill_delta(incoming: Data, previous: Data, fold: Fold) -> Data:
    return {
        **incoming,
        **{
            skill: fold.delta(incoming[skill], previous.get(skill) or {})
            for skill in SKILLS & incoming.keys()
            if incoming[skill] is not None
        },
    }


def progress(server: Data, incoming: Data) -> Data:
    merged = PROGRESS.merge(server, incoming)
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


def _progress_dominates(stored: Data, local: Data) -> bool:
    trend = {day["date"]: day for day in stored.get("accuracyTrend") or []}
    return (
        PROGRESS.dominates(stored, local)
        and all(
            day["date"] in trend and (trend[day["date"]].get("exercises") or 0) >= (day.get("exercises") or 0)
            for day in local.get("accuracyTrend") or []
        )
        and _per_skill_dominates(stored.get("skillProgress") or {}, local.get("skillProgress") or {}, SKILL_STATS)
    )


def _progress_delta(incoming: Data, previous: Data) -> Data:
    return {
        **PROGRESS.delta(incoming, previous),
        "skillProgress": _per_skill_delta(
            incoming.get("skillProgress") or {}, previous.get("skillProgress") or {}, SKILL_STATS
        ),
    }


def mastery(server: Data, incoming: Data) -> Data:
    return _per_skill(server, incoming, SKILL_MASTERY.merge)


def exercise_stat(server: Data, incoming: Data) -> Data:
    return EXERCISE_STAT.merge(server, incoming)


def mistake(server: Data, incoming: Data) -> Data:
    examples = [*(server.get("examples") or []), *(incoming.get("examples") or [])]
    return {**MISTAKE.merge(server, incoming), "examples": examples[-MAX_MISTAKE_EXAMPLES:]}


def _mistake_delta(incoming: Data, previous: Data) -> Data:
    seen = previous.get("examples") or []
    return {**MISTAKE.delta(incoming, previous), "examples": [e for e in incoming.get("examples") or [] if e not in seen]}


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


def _card_states_dominates(stored: Data, local: Data) -> bool:
    states = stored.get("states") or {}
    return all(front in states and _at_least(states[front], card, "updatedAt") for front, card in (local.get("states") or {}).items())


# Whether a stored record already reflects everything in a local one, per merge rule.
DOMINANCE: dict[MergeRule, Dominance] = {
    union: lambda stored, local: True,
    keep_server: lambda stored, local: True,
    learner_profile: PROFILE.dominates,
    progress: _progress_dominates,
    mastery: lambda stored, local: _per_skill_dominates(stored, local, SKILL_MASTERY),
    exercise_stat: EXERCISE_STAT.dominates,
    mistake: MISTAKE.dominates,
    higher_score: lambda stored, local: _at_least(stored, local, "score"),
    later_seen: lambda stored, local: _at_least(stored, local, "lastSeenAt"),
    later_updated: lambda stored, local: _at_least(stored, local, "updatedAt"),
    card_states: _card_states_dominates,
}

# The counting rules. A changed re-import from the same source merges as its change since the last one.
# Every other rule is idempotent, so the importer merges it again as is.
DELTAS: dict[MergeRule, Delta] = {
    learner_profile: PROFILE.delta,
    progress: _progress_delta,
    mastery: lambda incoming, previous: _per_skill_delta(incoming, previous, SKILL_MASTERY),
    exercise_stat: EXERCISE_STAT.delta,
    mistake: _mistake_delta,
}
