import re

import pytest
from fastapi.routing import APIRoute

from app.main import app

pytestmark = pytest.mark.real_auth

PUBLIC_PATHS = {
    "/api/health",
    "/api/health/deps",
    "/api/config",
    "/api/auth/login",
    "/api/auth/refresh",
    "/api/auth/register",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
}
# FastAPI's generated schema and docs pages. They expose route shapes, not data.
DOCS_PATHS = {"/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"}


def _api_routes() -> list[APIRoute]:
    routes = []
    for route in app.routes:
        if route.path in DOCS_PATHS:
            continue
        assert isinstance(route, APIRoute), f"{route.path} is not an APIRoute; decide its auth explicitly"
        routes.append(route)
    return routes


def test_every_public_path_exists():
    assert PUBLIC_PATHS <= {route.path for route in _api_routes()}


def _protected_calls() -> list[tuple[str, str]]:
    return [
        (method, re.sub(r"\{[^}]+\}", "x", route.path))
        for route in _api_routes()
        if route.path not in PUBLIC_PATHS
        for method in sorted(route.methods)
    ]


@pytest.mark.asyncio(loop_scope="session")
@pytest.mark.parametrize(("method", "path"), _protected_calls())
async def test_route_requires_a_token(client, method, path):
    response = await client.request(method, path)
    assert response.status_code == 401, response.text
    assert response.json() == {"detail": "Unauthorized"}
