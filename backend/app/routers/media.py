import httpx
from fastapi import APIRouter
from fastapi.responses import Response

from app.config import settings
from app.services import jellyfin as jellyfin_svc

router = APIRouter(prefix="/api/jellyfin", tags=["media"])

_ROUTE_MAP = {
    "/items/counts": "/Items/Counts",
    "/sessions": "/Sessions",
    "/system/info": "/System/Info",
}

# Routes that require a Jellyfin user ID prefix
_USER_ROUTE_MAP = {
    "/items/latest": "/Items/Latest?Limit=10&Fields=Overview,ImageTags,RunTimeTicks,CommunityRating,Genres,ProviderIds,OfficialRating,SeriesId,SeriesPrimaryImageTag",
}


def _get_user_id() -> str:
    users = jellyfin_svc.request("/Users")
    if isinstance(users, list) and users:
        return users[0].get("Id", "")
    return ""


def _poster_url(item_id: str, tag: str = "", max_height: int = 300) -> str:
    if not tag:
        return ""
    return f"/api/jellyfin-media/poster/{item_id}?maxHeight={max_height}&tag={tag}"


def _jellyfin_play_id(item_id: str) -> str:
    return item_id


def _item_to_dict(item: dict, user_id: str = "") -> dict:
    """Convert a Jellyfin item to a standardized dict."""
    item_type = item.get("Type", "")
    providers = item.get("ProviderIds", {})
    runtime = item.get("RunTimeTicks", 0)

    # For episodes, use the series poster instead of the episode still frame
    if item_type == "Episode" and item.get("SeriesId") and item.get("SeriesPrimaryImageTag"):
        poster = _poster_url(item["SeriesId"], item["SeriesPrimaryImageTag"])
    else:
        poster_tag = item.get("ImageTags", {}).get("Primary", "")
        poster = _poster_url(item["Id"], poster_tag)

    result = {
        "id": item["Id"],
        "name": item.get("Name", ""),
        "type": item_type,
        "year": str(item.get("ProductionYear", "")),
        "rating": item.get("CommunityRating"),
        "official_rating": item.get("OfficialRating", ""),
        "runtime_min": round(runtime / 600000000) if runtime else None,
        "genres": item.get("Genres", []),
        "overview": (item.get("Overview") or "")[:150],
        "poster": poster,
        "played": item.get("UserData", {}).get("Played", False),
        "favorite": item.get("UserData", {}).get("IsFavorite", False),
        "tmdb_id": providers.get("Tmdb", ""),
        "imdb_id": providers.get("Imdb", ""),
        "jellyfin_id": _jellyfin_play_id(item["Id"]),
        "season_count": item.get("ChildCount"),
    }

    # Progress info if partially watched
    pos = item.get("UserData", {}).get("PlaybackPositionTicks", 0)
    if pos and runtime:
        result["progress"] = round(pos / runtime * 100)
    else:
        result["progress"] = None

    return result


@router.get("-media/poster/{item_id}")
def poster_proxy(item_id: str, maxHeight: int = 300, tag: str = ""):
    """Proxy Jellyfin poster images."""
    url = f"{settings.jellyfin_base}/Items/{item_id}/Images/Primary?maxHeight={maxHeight}&tag={tag}&quality=90&api_key={settings.jellyfin_api_key}"
    try:
        resp = httpx.get(url, timeout=10)
        if resp.status_code == 200:
            return Response(
                content=resp.content,
                media_type=resp.headers.get("content-type", "image/jpeg"),
                headers={"Cache-Control": "public, max-age=86400"},
            )
    except Exception:
        pass
    return Response(status_code=404)


@router.get("-media/play/{item_id}")
def play_redirect(item_id: str):
    """Redirect to Jellyfin web player for an item."""
    from fastapi.responses import RedirectResponse

    jf_url = settings.jellyfin_base.replace("localhost", "192.168.0.2")
    return RedirectResponse(url=f"{jf_url}/web/#/details?id={item_id}")


def _item_size_bytes(item_id: str, user_id: str) -> int:
    """Best-effort total media file size for an item, in bytes. For a series,
    sums the sizes of all its episodes."""
    total = 0
    item = jellyfin_svc.request(f"/Users/{user_id}/Items/{item_id}?Fields=MediaSources")
    if not isinstance(item, dict):
        return 0
    for ms in item.get("MediaSources") or []:
        total += ms.get("Size") or 0
    if item.get("Type") == "Series":
        eps = jellyfin_svc.request(
            f"/Users/{user_id}/Items?ParentId={item_id}&Recursive=true&IncludeItemTypes=Episode&Fields=MediaSources"
        )
        if isinstance(eps, dict):
            for ep in eps.get("Items") or []:
                for ms in ep.get("MediaSources") or []:
                    total += ms.get("Size") or 0
    return total


@router.delete("-media/item/{item_id}")
def delete_media_item(item_id: str):
    """Delete a movie or series (and its files on disk) to free up space."""
    user_id = _get_user_id()
    freed = _item_size_bytes(item_id, user_id) if user_id else 0
    result = jellyfin_svc.delete_item(item_id)
    if result.get("ok"):
        result["freed_bytes"] = freed
    return result


@router.get("-media/library-check")
def library_check(tmdb_id: str = "", title: str = "", media_type: str = "movie"):
    """Check if a movie/series exists in Jellyfin library by TMDB ID or title."""
    user_id = _get_user_id()
    if not user_id:
        return {"in_library": False}

    item_type = "Series" if media_type in ("tv", "series") else "Movie"
    items = jellyfin_svc.request(
        f"/Users/{user_id}/Items?IncludeItemTypes={item_type}&Recursive=true"
        f"&Fields=ProviderIds,ImageTags,RunTimeTicks,CommunityRating,Genres"
    )

    if isinstance(items, dict) and items.get("Items"):
        for item in items["Items"]:
            providers = item.get("ProviderIds", {})
            if tmdb_id and providers.get("Tmdb") == str(tmdb_id):
                return {"in_library": True, **_item_to_dict(item, user_id)}
            if title and item.get("Name", "").lower() == title.lower():
                return {"in_library": True, **_item_to_dict(item, user_id)}

    return {"in_library": False}


@router.get("/{path:path}")
def jellyfin_proxy(path: str):
    route = f"/{path}"
    jf_path = _ROUTE_MAP.get(route)
    if jf_path:
        return jellyfin_svc.request(jf_path)
    user_path = _USER_ROUTE_MAP.get(route)
    if user_path:
        user_id = _get_user_id()
        if not user_id:
            return {"error": "No Jellyfin user found"}
        return jellyfin_svc.request(f"/Users/{user_id}{user_path}")
    return {"error": "Unknown endpoint"}


@router.get("-media/overview")
def media_overview():
    """Aggregated media page data."""
    user_id = _get_user_id()
    if not user_id:
        return {"error": "No Jellyfin user found"}

    result = {}

    # Counts
    counts = jellyfin_svc.request("/Items/Counts")
    result["counts"] = counts if not isinstance(counts, dict) or "error" not in counts else None

    # Continue watching
    resume = jellyfin_svc.request(
        f"/Users/{user_id}/Items/Resume?Limit=10"
        f"&Fields=Overview,RunTimeTicks,ImageTags,SeriesName,ParentIndexNumber,IndexNumber,ProviderIds,SeriesId,SeriesPrimaryImageTag"
    )
    continue_watching = []
    if isinstance(resume, dict) and resume.get("Items"):
        for item in resume["Items"]:
            d = _item_to_dict(item, user_id)
            if item.get("Type") == "Episode":
                d["name"] = (
                    f"{item.get('SeriesName', '')} S{item.get('ParentIndexNumber', '?')}E{item.get('IndexNumber', '?')}"
                )
                d["episode_title"] = item.get("Name", "")
            continue_watching.append(d)
    result["continue_watching"] = continue_watching

    # Now playing
    sessions = jellyfin_svc.request("/Sessions")
    now_playing = []
    if isinstance(sessions, list):
        for s in sessions:
            np = s.get("NowPlayingItem")
            if np:
                pos = s.get("PlayState", {}).get("PositionTicks", 0)
                total = np.get("RunTimeTicks", 1) or 1
                # Use series poster for episodes
                if np.get("Type") == "Episode" and np.get("SeriesId") and np.get("SeriesPrimaryImageTag"):
                    poster = _poster_url(np["SeriesId"], np["SeriesPrimaryImageTag"])
                else:
                    poster = _poster_url(np["Id"], np.get("ImageTags", {}).get("Primary", ""))
                now_playing.append(
                    {
                        "user": s.get("UserName", ""),
                        "client": s.get("Client", ""),
                        "device": s.get("DeviceName", ""),
                        "title": np.get("Name", ""),
                        "type": np.get("Type", ""),
                        "progress": round(pos / total * 100),
                        "poster": poster,
                        "is_paused": s.get("PlayState", {}).get("IsPaused", False),
                        "jellyfin_id": _jellyfin_play_id(np["Id"]),
                    }
                )
    result["now_playing"] = now_playing

    # Next up (series)
    nextup = jellyfin_svc.request(
        f"/Shows/NextUp?userId={user_id}&Limit=10"
        f"&Fields=Overview,ImageTags,RunTimeTicks,ParentIndexNumber,IndexNumber,SeriesId,SeriesPrimaryImageTag"
    )
    next_episodes = []
    if isinstance(nextup, dict) and nextup.get("Items"):
        for item in nextup["Items"]:
            # Use series poster, not episode still frame
            if item.get("SeriesId") and item.get("SeriesPrimaryImageTag"):
                poster = _poster_url(item["SeriesId"], item["SeriesPrimaryImageTag"])
            else:
                poster = _poster_url(item["Id"], item.get("ImageTags", {}).get("Primary", ""))
            next_episodes.append(
                {
                    "id": item["Id"],
                    "series_name": item.get("SeriesName", ""),
                    "season": item.get("ParentIndexNumber", 0),
                    "episode": item.get("IndexNumber", 0),
                    "name": item.get("Name", ""),
                    "overview": (item.get("Overview") or "")[:150],
                    "runtime_min": round(item.get("RunTimeTicks", 0) / 600000000),
                    "poster": poster,
                    "jellyfin_id": _jellyfin_play_id(item["Id"]),
                }
            )
    result["next_up"] = next_episodes

    # Unwatched movies
    unwatched = jellyfin_svc.request(
        f"/Users/{user_id}/Items?IncludeItemTypes=Movie&Recursive=true&IsPlayed=false"
        f"&SortBy=DateCreated&SortOrder=Descending&Limit=20"
        f"&Fields=Overview,CommunityRating,RunTimeTicks,ImageTags,Genres,ProviderIds,OfficialRating"
    )
    unwatched_movies = []
    if isinstance(unwatched, dict) and unwatched.get("Items"):
        for item in unwatched["Items"]:
            unwatched_movies.append(_item_to_dict(item, user_id))
    result["unwatched"] = unwatched_movies

    # Recently watched
    watched = jellyfin_svc.request(
        f"/Users/{user_id}/Items?IncludeItemTypes=Movie,Episode&Recursive=true&IsPlayed=true"
        f"&SortBy=DatePlayed&SortOrder=Descending&Limit=10"
        f"&Fields=RunTimeTicks,DatePlayed,SeriesName,ImageTags,ProviderIds,ParentIndexNumber,IndexNumber,SeriesId,SeriesPrimaryImageTag"
    )
    watch_history = []
    if isinstance(watched, dict) and watched.get("Items"):
        for item in watched["Items"]:
            d = _item_to_dict(item, user_id)
            d["date_played"] = item.get("UserData", {}).get("LastPlayedDate", "")
            if item.get("Type") == "Episode":
                d["name"] = (
                    f"{item.get('SeriesName', '')} S{item.get('ParentIndexNumber', '?')}E{item.get('IndexNumber', '?')}"
                )
                d["episode_title"] = item.get("Name", "")
            watch_history.append(d)
    result["watch_history"] = watch_history

    # All library items (for browsing)
    all_movies = jellyfin_svc.request(
        f"/Users/{user_id}/Items?IncludeItemTypes=Movie&Recursive=true"
        f"&SortBy=SortName&Limit=100"
        f"&Fields=Overview,CommunityRating,RunTimeTicks,ImageTags,Genres,ProviderIds,OfficialRating"
    )
    all_series = jellyfin_svc.request(
        f"/Users/{user_id}/Items?IncludeItemTypes=Series&Recursive=true"
        f"&SortBy=SortName&Limit=50"
        f"&Fields=Overview,CommunityRating,ImageTags,ChildCount,Genres,ProviderIds"
    )
    library = []
    for src in [all_movies, all_series]:
        if isinstance(src, dict) and src.get("Items"):
            for item in src["Items"]:
                library.append(_item_to_dict(item, user_id))
    result["library"] = library

    # Genre breakdown
    genre_counts = {}
    for item in library:
        for g in item.get("genres", []):
            genre_counts[g] = genre_counts.get(g, 0) + 1
    result["genres"] = sorted(
        [{"name": g, "count": c} for g, c in genre_counts.items()], key=lambda x: x["count"], reverse=True
    )

    # Total runtime
    total_min = sum(item.get("runtime_min") or 0 for item in library)
    result["total_runtime_hours"] = round(total_min / 60, 1)

    return result
