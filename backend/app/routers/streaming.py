from fastapi import APIRouter

from app.services import youtube

router = APIRouter(prefix="/api/streaming", tags=["streaming"])


@router.get("/youtube")
def youtube_check(title: str = "", year: str = ""):
    """Search YouTube for a full movie. Returns URL if a verified match is found."""
    if not title:
        return {"available": False}
    match = youtube.search_full_movie(title, year)
    if not match:
        return {"available": False}
    return {
        "available": True,
        "url": match["url"],
        "title": match["title"],
        "duration": match["duration"],
        "channel": match["channel"],
    }
