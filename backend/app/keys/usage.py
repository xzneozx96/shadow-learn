import math
import time
import uuid
from collections import defaultdict, deque
from collections.abc import Callable

from fastapi import HTTPException

from app.accounts.deps import CurrentUser
from app.settings import settings

WINDOW_SECONDS = 60.0


class RateLimiter:
    """Sliding one-minute window per account, held in memory by the single uvicorn worker."""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._hits: defaultdict[uuid.UUID, deque[float]] = defaultdict(deque)

    def retry_after(self, user_id: uuid.UUID, limit: int) -> float | None:
        """Record a hit and return None, or return the seconds until the oldest hit leaves the window."""
        now = self._clock()
        hits = self._hits[user_id]
        while hits and hits[0] <= now - WINDOW_SECONDS:
            hits.popleft()
        if len(hits) >= limit:
            return hits[0] + WINDOW_SECONDS - now
        hits.append(now)
        return None


rate_limiter = RateLimiter()


def enforce_rate_limit(user: CurrentUser) -> None:
    wait = rate_limiter.retry_after(user.id, settings.rate_limit_per_minute)
    if wait is not None:
        seconds = max(1, math.ceil(wait))
        raise HTTPException(
            status_code=429,
            detail=f"Too many requests. Try again in {seconds} seconds.",
            headers={"Retry-After": str(seconds)},
        )
