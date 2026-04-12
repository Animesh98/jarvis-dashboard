from fastapi import APIRouter
from pydantic import BaseModel

from app.services import database as db

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


class WatchlistAdd(BaseModel):
    tmdb_id: str
    media_type: str = "movie"
    title: str
    year: str = ""
    poster: str = ""
    category: str = "Must Watch"


class WatchlistUpdate(BaseModel):
    tmdb_id: str
    media_type: str = "movie"
    category: str


@router.get("")
def list_watchlist(category: str = ""):
    items = db.watchlist_list(category)
    return {"items": items}


@router.post("")
def add_to_watchlist(body: WatchlistAdd):
    return db.watchlist_add(
        body.tmdb_id,
        body.media_type,
        body.title,
        body.year,
        body.poster,
        body.category,
    )


@router.delete("")
def remove_from_watchlist(tmdb_id: str, media_type: str = "movie"):
    return db.watchlist_remove(tmdb_id, media_type)


@router.get("/check")
def check_watchlist(tmdb_id: str, media_type: str = "movie"):
    entry = db.watchlist_check(tmdb_id, media_type)
    return {"in_watchlist": entry is not None, "category": entry["category"] if entry else None}


@router.patch("")
def update_watchlist_category(body: WatchlistUpdate):
    return db.watchlist_update_category(body.tmdb_id, body.media_type, body.category)
