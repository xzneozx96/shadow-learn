from fastapi import HTTPException


def _resolve_key(request_key: str | None, fallback: str | None, name: str) -> str:
    """Return the effective API key: prefer request_key, fall back to server env var.

    Raises HTTP 400 if neither is available.
    """
    key = request_key or fallback
    if not key:
        raise HTTPException(
            status_code=400,
            detail=f"No {name} provided and no server fallback configured",
        )
    return key
