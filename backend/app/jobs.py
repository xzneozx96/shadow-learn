"""In-memory job store for background lesson processing."""

import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Job:
    status: str          # "processing" | "complete" | "error"
    step: str            # valid: "queued"|"video_download"|"audio_extraction"|"upload"|"duration_check"|"transcription"|"pinyin"|"translation"|"assembling"|"complete"
    result: dict[str, Any] | None  # { lesson: {...}, video_url? } when complete; None otherwise
    error: str | None    # error message if failed; None otherwise
    created_at: float = field(default_factory=time.time)


jobs: dict[str, Job] = {}


def prune_expired_jobs(max_age_seconds: float = 3600.0) -> None:
    """Remove jobs older than max_age_seconds. Called on every poll request."""
    now = time.time()
    expired = [jid for jid, job in jobs.items() if now - job.created_at > max_age_seconds]
    for jid in expired:
        del jobs[jid]
