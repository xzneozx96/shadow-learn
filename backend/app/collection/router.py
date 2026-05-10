"""Collection endpoint — curated YouTube playlists for shadowing practice."""
import asyncio

from fastapi import APIRouter, HTTPException

from app.collection.service import get_collection, get_playlist_videos

router = APIRouter(prefix="/api")


@router.get("/collection")
async def get_collection_endpoint() -> dict:
    """Return the Learning Hub response with materials and tips."""
    return await asyncio.to_thread(get_collection)


@router.get("/playlist/{playlist_id}")
async def get_playlist_endpoint(playlist_id: str) -> dict:
    """Return name, thumbnail, topic, and videos for one curated playlist."""
    result = await asyncio.to_thread(get_playlist_videos, playlist_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return result
