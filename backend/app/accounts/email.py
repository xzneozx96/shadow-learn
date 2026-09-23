import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage
from urllib.parse import quote

from app.settings import settings

logger = logging.getLogger(__name__)


def _send(message: EmailMessage) -> None:
    # smtplib's own default context skips certificate checks.
    context = ssl.create_default_context()
    if settings.smtp_security == "ssl":
        client = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=10, context=context)
    else:
        client = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10)
    with client:
        if settings.smtp_security == "starttls":
            client.starttls(context=context)
        if settings.smtp_user:
            client.login(settings.smtp_user, settings.smtp_password)
        client.send_message(message)


async def send_reset_email(to: str, token: str) -> None:
    link = f"{settings.public_app_url}/reset-password?token={quote(token)}"
    if not settings.smtp_host:
        logger.info("reset link %s", link)
        return
    message = EmailMessage()
    message["Subject"] = "Reset your ShadowLearn password"
    message["From"] = settings.smtp_from
    message["To"] = to
    message.set_content(
        f"Open this link to choose a new password:\n\n{link}\n\n"
        "The link expires in one hour. If you did not ask for a reset, ignore this email."
    )
    await asyncio.to_thread(_send, message)
