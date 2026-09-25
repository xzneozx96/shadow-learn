import pytest
from pydantic import ValidationError

from app.settings import Settings

SECRETS = {"jwt_secret": "a" * 32, "jwt_refresh_secret": "b" * 32}


def _settings(**overrides) -> Settings:
    return Settings(_env_file=None, **SECRETS, **overrides)


def test_missing_smtp_fails_startup_outside_local_dev():
    with pytest.raises(ValidationError, match="SMTP_HOST is required outside local dev"):
        _settings(smtp_host="", public_app_url="https://learning.example.com")


@pytest.mark.parametrize("url", ["http://localhost:5173", "http://127.0.0.1:5352"])
def test_local_dev_may_log_reset_links_without_smtp(url):
    assert _settings(smtp_host="", public_app_url=url).smtp_host == ""


def test_production_url_with_smtp_starts():
    assert _settings(smtp_host="smtp.example.com", public_app_url="https://learning.example.com").smtp_host


def test_short_jwt_secret_fails_startup():
    with pytest.raises(ValidationError, match="at least 32 characters"):
        Settings(_env_file=None, jwt_secret="short", jwt_refresh_secret="b" * 32)


def test_startup_errors_do_not_echo_setting_values():
    with pytest.raises(ValidationError) as excinfo:
        Settings(_env_file=None, jwt_secret="short-but-real-secret", jwt_refresh_secret="b" * 32)
    assert "short-but-real-secret" not in str(excinfo.value)
    assert "input_value" not in str(excinfo.value)


@pytest.mark.parametrize("key", ["", "not-a-fernet-key"])
def test_missing_or_invalid_encryption_key_fails_startup(key):
    with pytest.raises(ValidationError, match="SHADOWLEARN_ENCRYPTION_KEY must be a Fernet key"):
        _settings(encryption_key=key)


def test_test_routes_fail_startup_outside_local_dev():
    with pytest.raises(ValidationError, match="SHADOWLEARN_ENABLE_TEST_ROUTES is refused outside local dev"):
        _settings(smtp_host="smtp.example.com", public_app_url="https://learning.example.com", enable_test_routes=True)


@pytest.mark.parametrize("url", ["http://localhost:5173", "http://127.0.0.1:5601"])
def test_local_dev_may_enable_test_routes(url):
    assert _settings(public_app_url=url, enable_test_routes=True).enable_test_routes


def test_import_fault_fails_startup_outside_local_dev():
    with pytest.raises(ValidationError, match="SHADOWLEARN_IMPORT_FAULT is refused outside local dev"):
        _settings(smtp_host="smtp.example.com", public_app_url="https://learning.example.com", import_fault="vocabulary")


def test_local_dev_may_set_an_import_fault():
    assert _settings(public_app_url="http://localhost:5173", import_fault="vocabulary").import_fault == "vocabulary"
