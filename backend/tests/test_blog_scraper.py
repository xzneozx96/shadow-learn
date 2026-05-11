import pytest
import respx
import httpx

from app.lessons.services.blog_scraper import scrape_article, _validate_url


def test_validate_url_rejects_non_http():
    with pytest.raises(ValueError, match="Only http"):
        _validate_url("ftp://example.com")


def test_validate_url_rejects_file_scheme():
    with pytest.raises(ValueError, match="Only http"):
        _validate_url("file:///etc/passwd")


def test_validate_url_rejects_private_ip(monkeypatch):
    import socket
    monkeypatch.setattr(socket, "gethostbyname", lambda h: "192.168.1.1")
    with pytest.raises(ValueError, match="private"):
        _validate_url("http://internal.example.com")


def test_validate_url_rejects_loopback(monkeypatch):
    import socket
    monkeypatch.setattr(socket, "gethostbyname", lambda h: "127.0.0.1")
    with pytest.raises(ValueError, match="private"):
        _validate_url("http://localhost")


def test_validate_url_accepts_public_ip(monkeypatch):
    import socket
    monkeypatch.setattr(socket, "gethostbyname", lambda h: "1.2.3.4")
    _validate_url("https://example.com")  # should not raise


@pytest.mark.asyncio
async def test_scrape_article_extracts_text(monkeypatch):
    import socket
    monkeypatch.setattr(socket, "gethostbyname", lambda h: "1.2.3.4")

    html = """<html><head><title>My Article</title></head><body>
    <article><p>This is the main article content with enough text to pass the minimum length check for extraction purposes.</p></article>
    <nav>Navigation noise that trafilatura should strip out automatically.</nav>
    </body></html>"""

    with respx.mock:
        respx.get("https://example.com/article").mock(
            return_value=httpx.Response(200, text=html, headers={"content-type": "text/html"})
        )
        title, text = await scrape_article("https://example.com/article")

    assert "article content" in text
    assert "\n" not in text  # newlines collapsed to spaces


@pytest.mark.asyncio
async def test_scrape_article_raises_on_empty_extraction(monkeypatch):
    import socket
    monkeypatch.setattr(socket, "gethostbyname", lambda h: "1.2.3.4")

    with respx.mock:
        respx.get("https://example.com/empty").mock(
            return_value=httpx.Response(200, text="<html><body></body></html>")
        )
        with pytest.raises(ValueError, match="Could not extract"):
            await scrape_article("https://example.com/empty")


@pytest.mark.asyncio
async def test_scrape_article_truncates_at_max_chars(monkeypatch):
    import socket
    monkeypatch.setattr(socket, "gethostbyname", lambda h: "1.2.3.4")

    long_text = "word " * 5000  # 25000 chars
    html = f"<html><head><title>Long</title></head><body><article><p>{long_text}</p></article></body></html>"

    with respx.mock:
        respx.get("https://example.com/long").mock(
            return_value=httpx.Response(200, text=html)
        )
        _, text = await scrape_article("https://example.com/long", max_chars=100)

    assert len(text) <= 100
