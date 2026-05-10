"""Collection endpoint — curated YouTube playlists for shadowing practice."""
import asyncio

from fastapi import APIRouter

from app.collection.service import get_collection

router = APIRouter(prefix="/api")


@router.get("/collection")
async def get_collection_endpoint() -> list[dict]:
    """Return curated playlists with merged video metadata."""
    return await asyncio.to_thread(get_collection)
