import hashlib
from collections.abc import Iterable
from typing import Any

import rfc8785

MAX_SAFE_INTEGER = 2**53 - 1


def _as_js_number(value: Any) -> Any:
    if isinstance(value, bool) or value is None or isinstance(value, str | float):
        return value
    if isinstance(value, int):
        return value if abs(value) <= MAX_SAFE_INTEGER else float(value)
    if isinstance(value, dict):
        return {key: _as_js_number(item) for key, item in value.items()}
    return [_as_js_number(item) for item in value]


def canonical(value: Any) -> bytes:
    """JSONB reads ``1e21`` back as an integer, and JS holds every number as a
    double, so integers past 2**53 are compared as the double JS would hold.
    """
    return rfc8785.dumps(_as_js_number(value))


def store_hash(records: Iterable[tuple[str, Any]]) -> str:
    digest = hashlib.sha256()
    for _, value in sorted(records, key=lambda record: record[0].encode()):
        digest.update(canonical(value) + b"\n")
    return digest.hexdigest()
