import hmac

from fastapi import Header, HTTPException

from api.config import settings


def _extract_key(authorization: str | None, x_api_key: str | None) -> str | None:
    if x_api_key:
        return x_api_key
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


async def require_api_key(
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> None:
    """Gate every protected route behind a single shared secret.

    Accepts either ``Authorization: Bearer <key>`` or ``X-API-Key: <key>``.
    """
    provided = _extract_key(authorization, x_api_key)
    expected = settings.API_SECRET_KEY
    if not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
