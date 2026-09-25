from unittest.mock import AsyncMock

import pytest
from botocore.exceptions import EndpointConnectionError
from httpx import ASGITransport, AsyncClient

from app.main import app

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest.fixture
def client(s3, migrated_database):
    app.state.s3 = s3
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_health_deps_reports_both_ok(client):
    response = await client.get("/api/health/deps")

    assert response.status_code == 200
    assert response.json() == {"db": "ok", "s3": "ok"}


async def test_health_deps_reports_s3_error_when_head_bucket_raises(client, s3, monkeypatch):
    monkeypatch.setattr(
        s3, "head_bucket", AsyncMock(side_effect=EndpointConnectionError(endpoint_url="http://s3"))
    )

    response = await client.get("/api/health/deps")

    assert response.status_code == 503
    assert response.json() == {"db": "ok", "s3": "error"}
