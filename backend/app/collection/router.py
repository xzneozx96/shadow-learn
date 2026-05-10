"""Collection endpoint — curated YouTube playlists for shadowing practice."""
import asyncio

from fastapi import APIRouter

from app.collection.service import get_collection

router = APIRouter(prefix="/api")


@router.get("/collection")
async def get_collection_endpoint() -> dict:
    """Return the Learning Hub response with materials and tips."""
    return await asyncio.to_thread(get_collection)
