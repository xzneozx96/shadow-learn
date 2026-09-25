import math
import time
from collections import deque
from collections.abc import Callable, Hashable

from fastapi import HTTPException

from app.accounts.deps import CurrentUser
from app.settings import settings

WINDOW_SECONDS = 60.0


class RateLimiter:
    """Sliding one-minute window held in this process, so it is correct only with a single uvicorn worker."""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._hits: dict[Hashable, deque[float]] = {}

    def hit(self, key: Hashable, limit: int) -> float | None:
        """Record a hit and return None, or return the seconds to wait without recording one."""
        now = self._clock()
        self._evict(now)
        hits = self._hits.setdefault(key, deque())
        if len(hits) >= limit:
            return hits[0] + WINDOW_SECONDS - now
        hits.append(now)
        return None

    def clear(self) -> None:
        self._hits.clear()

    def _evict(self, now: float) -> None:
        for key in list(self._hits):
            hits = self._hits[key]
            while hits and hits[0] <= now - WINDOW_SECONDS:
                hits.popleft()
            if not hits:
                del self._hits[key]


def too_many_requests(wait: float, detail: str) -> HTTPException:
    seconds = max(1, math.ceil(wait))
    return HTTPException(status_code=429, detail=detail.format(seconds=seconds), headers={"Retry-After": str(seconds)})


rate_limiter = RateLimiter()


async def enforce_rate_limit(user: CurrentUser) -> None:
    wait = rate_limiter.hit(user.id, settings.rate_limit_per_minute)
    if wait is not None:
        raise too_many_requests(wait, "Too many requests. Try again in {seconds} seconds.")
