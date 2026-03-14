import pytest
from app.services.validation import validate_youtube_url, ValidationError


def test_valid_youtube_url():
    url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    video_id = validate_youtube_url(url)
    assert video_id == "dQw4w9WgXcQ"


def test_valid_short_youtube_url():
    url = "https://youtu.be/dQw4w9WgXcQ"
    video_id = validate_youtube_url(url)
    assert video_id == "dQw4w9WgXcQ"


def test_invalid_youtube_url():
    with pytest.raises(ValidationError, match="Invalid YouTube URL"):
        validate_youtube_url("https://example.com/video")


def test_empty_youtube_url():
    with pytest.raises(ValidationError, match="Invalid YouTube URL"):
        validate_youtube_url("")


def test_youtube_url_with_extra_params():
    url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30"
    video_id = validate_youtube_url(url)
    assert video_id == "dQw4w9WgXcQ"


from app.services.validation import validate_upload_file

def test_valid_upload_file():
    validate_upload_file("video.mp4", 500_000_000)

def test_upload_invalid_format():
    with pytest.raises(ValidationError, match="Unsupported format"):
        validate_upload_file("video.avi", 100)

def test_upload_too_large():
    with pytest.raises(ValidationError, match="size limit"):
        validate_upload_file("video.mp4", 3_000_000_000)
