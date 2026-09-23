import ssl
from email.message import EmailMessage
from unittest.mock import MagicMock

import pytest

from app.accounts import email as account_email
from app.settings import settings


@pytest.fixture
def smtp(monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", "relay.example")
    monkeypatch.setattr(settings, "smtp_port", 465)
    monkeypatch.setattr(settings, "smtp_user", "")
    plain, implicit = MagicMock(), MagicMock()
    monkeypatch.setattr(account_email.smtplib, "SMTP", plain)
    monkeypatch.setattr(account_email.smtplib, "SMTP_SSL", implicit)
    return plain, implicit


def test_ssl_verifies_the_relay_certificate(monkeypatch, smtp):
    _, implicit = smtp
    monkeypatch.setattr(settings, "smtp_security", "ssl")
    account_email._send(EmailMessage())
    context = implicit.call_args.kwargs["context"]
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname


def test_starttls_verifies_the_relay_certificate(monkeypatch, smtp):
    plain, _ = smtp
    monkeypatch.setattr(settings, "smtp_security", "starttls")
    account_email._send(EmailMessage())
    context = plain.return_value.starttls.call_args.kwargs["context"]
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname
