"""Collection endpoint — curated YouTube playlists for shadowing practice."""
import asyncio

from fastapi import APIRouter, HTTPException

from app.collection.service import (
    get_collection,
    get_playlist_videos,
    get_video_metadata,
    resolve_curated_video,
)

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


@router.get("/video/{video_id}")
async def get_video_endpoint(video_id: str) -> dict:
    """Return standalone video metadata: title, channel, duration, view_count, published_at."""
    result = await asyncio.to_thread(get_video_metadata, video_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Video not found")
    return result


@router.get("/collection/resolve/{video_id}")
async def resolve_video_endpoint(video_id: str) -> dict:
    """Resolve a recommended YouTube video to its internal tip route (playlist or standalone)."""
    result = await asyncio.to_thread(resolve_curated_video, video_id)
    if result["status"] in ("video", "playlist"):
        return result
    if result["status"] == "not_curated":
        raise HTTPException(status_code=404, detail="Not a curated video")
    raise HTTPException(status_code=503, detail="Resolution unavailable")
