import logging

import app.main  # noqa: F401  (attaches the filter to uvicorn.access)


def _access_record(path: str) -> logging.LogRecord:
    return logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        __file__,
        0,
        '%s - "%s %s HTTP/%s" %d',
        ("127.0.0.1:50000", "GET", path, "1.1", 200),
        None,
    )


def test_access_log_redacts_the_media_ticket():
    record = _access_record("/api/media/abc?token=eyJhbGciOi.secret-part.sig&x=1")

    assert logging.getLogger("uvicorn.access").filter(record)

    message = record.getMessage()
    assert "token=<redacted>&x=1" in message
    assert "secret-part" not in message


def test_access_log_passes_a_path_without_a_ticket_through():
    record = _access_record("/api/lessons?limit=5")

    assert logging.getLogger("uvicorn.access").filter(record)

    assert record.getMessage() == '127.0.0.1:50000 - "GET /api/lessons?limit=5 HTTP/1.1" 200'
