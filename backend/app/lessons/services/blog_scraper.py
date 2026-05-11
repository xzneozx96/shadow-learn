"""Blog/news article scraper using trafilatura."""

import ipaddress
import socket
from urllib.parse import urlparse

import httpx
import trafilatura

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}


def _validate_url(url: str) -> None:
    """Reject non-http(s) schemes and private/loopback IPs."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Only http and https URLs are supported.")
    hostname = parsed.hostname or ""
    try:
        ip = ipaddress.ip_address(socket.gethostbyname(hostname))
    except socket.gaierror:
        raise ValueError(f"Could not resolve hostname: {hostname}")
    if ip.is_private or ip.is_loopback or ip.is_link_local:
        raise ValueError("URL resolves to a private or reserved IP address.")


async def scrape_article(url: str, max_chars: int = 8000) -> tuple[str, str]:
    """Fetch URL and extract (title, text).

    Returns:
        (title, text) — text has newlines collapsed to spaces, truncated to max_chars.

    Raises:
        ValueError: If URL is invalid, IP is private, or article text cannot be extracted.
        httpx.HTTPStatusError: If the server returns 4xx/5xx.
    """
    _validate_url(url)

    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
        resp = await client.get(url, headers=_HEADERS)
        resp.raise_for_status()

    text = trafilatura.extract(resp.text, include_comments=False, include_tables=False)
    if not text or len(text) < 50:
        raise ValueError(
            "Could not extract article text from this URL. "
            "The page may require JavaScript rendering or be behind a paywall."
        )

    text = " ".join(text.splitlines())

    if len(text) > max_chars:
        text = text[:max_chars]

    meta = trafilatura.extract_metadata(resp.text)
    title = meta.title if meta and meta.title else url
    return title, text
