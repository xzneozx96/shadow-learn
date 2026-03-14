import re
from app.config import settings


class ValidationError(Exception):
    """Raised when input validation fails."""
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


_YOUTUBE_PATTERNS = [
    re.compile(r"(?:youtube\.com/watch\?.*v=)([\w-]{11})"),
    re.compile(r"(?:youtu\.be/)([\w-]{11})"),
    re.compile(r"(?:youtube\.com/embed/)([\w-]{11})"),
]


def validate_youtube_url(url: str) -> str:
    for pattern in _YOUTUBE_PATTERNS:
        match = pattern.search(url)
        if match:
            return match.group(1)
    raise ValidationError("Invalid YouTube URL. Please provide a valid YouTube link.")


def validate_upload_file(filename: str, size_bytes: int) -> None:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in settings.allowed_video_formats:
        allowed = ", ".join(settings.allowed_video_formats)
        raise ValidationError(f"Unsupported format '.{ext}'. Accepted formats: {allowed}")
    if size_bytes > settings.max_upload_size_bytes:
        max_gb = settings.max_upload_size_bytes / (1024**3)
        raise ValidationError(f"File exceeds the {max_gb:.0f} GB size limit.")
