import pytest
from fastapi import APIRouter, Depends, FastAPI
from fastapi.responses import StreamingResponse
from httpx import ASGITransport, AsyncClient

from app.accounts.deps import current_active_user
from app.db import engine

pytestmark = [pytest.mark.asyncio(loop_scope="session"), pytest.mark.real_auth]


async def test_auth_lookup_returns_its_connection_before_the_response_streams(user):
    seen_during_stream = []

    async def body():
        seen_during_stream.append(engine.pool.checkedout())
        yield b"chunk"

    router = APIRouter()

    @router.get("/stream")
    async def stream():
        return StreamingResponse(body())

    probe = FastAPI()
    probe.include_router(router, dependencies=[Depends(current_active_user)])
    async with AsyncClient(transport=ASGITransport(app=probe), base_url="http://test") as http:
        response = await http.get("/stream", headers={"Authorization": f"Bearer {user['access_token']}"})

    assert response.status_code == 200
    assert seen_during_stream == [0]
