import concurrent.futures
import threading
import urllib.parse

import httpx
from cachetools import TTLCache

from app.config import settings

# LRU cache for raw TMDB fetch responses — deduplicates across endpoints.
# TTLCache is not thread-safe and fetch() runs from ThreadPoolExecutor
# workers, so all access goes through _fetch_lock.
_fetch_cache: TTLCache = TTLCache(maxsize=500, ttl=3600)
_fetch_lock = threading.Lock()

_client = httpx.Client(
    timeout=10,
    headers={
        "User-Agent": "JarvisDashboard/1.0",
        "Accept": "application/json",
    },
)


def fetch(endpoint: str) -> dict:
    with _fetch_lock:
        cached = _fetch_cache.get(endpoint)
    if cached is not None:
        return cached
    sep = "&" if "?" in endpoint else "?"
    url = f"{settings.tmdb_base}{endpoint}{sep}api_key={settings.tmdb_api_key}"
    try:
        resp = _client.get(url)
        # Don't cache failures — a 429/5xx body would otherwise be served
        # as data for the next hour
        if resp.status_code != 200:
            print(f"[TMDB] HTTP {resp.status_code} for {endpoint}")
            return {}
        data = resp.json()
        with _fetch_lock:
            _fetch_cache[endpoint] = data
        return data
    except Exception as e:
        print(f"[TMDB] Error fetching {endpoint}: {e}")
        return {}


def search_similar(title: str) -> tuple[list, set]:
    tmdb_results = []
    seen_tmdb = set()

    movie_search = fetch(f"/search/movie?query={urllib.parse.quote(title)}")
    if movie_search.get("results"):
        movie_id = movie_search["results"][0].get("id")
        if movie_id:
            similar = fetch(f"/movie/{movie_id}/similar")
            for s in similar.get("results", [])[:15]:
                s_title = s.get("title", "")
                key = s_title.lower()
                if key and key not in seen_tmdb:
                    seen_tmdb.add(key)
                    year = (s.get("release_date") or "")[:4]
                    poster = f"/api/tmdb-image/w500{s['poster_path']}" if s.get("poster_path") else ""
                    tmdb_results.append(
                        {
                            "title": s_title,
                            "year": year,
                            "type": "movie",
                            "description": (s.get("overview") or "")[:200],
                            "rating": str(round(s.get("vote_average", 0), 1)),
                            "poster": poster,
                            "tmdb_id": str(s.get("id", "")),
                            "torrent_query": f"{s_title} {year}".strip(),
                        }
                    )

    tv_search = fetch(f"/search/tv?query={urllib.parse.quote(title)}")
    if tv_search.get("results"):
        tv_id = tv_search["results"][0].get("id")
        if tv_id:
            similar = fetch(f"/tv/{tv_id}/similar")
            for s in similar.get("results", [])[:15]:
                s_title = s.get("name", "")
                key = s_title.lower()
                if key and key not in seen_tmdb:
                    seen_tmdb.add(key)
                    year = (s.get("first_air_date") or "")[:4]
                    poster = f"/api/tmdb-image/w500{s['poster_path']}" if s.get("poster_path") else ""
                    tmdb_results.append(
                        {
                            "title": s_title,
                            "year": year,
                            "type": "series",
                            "description": (s.get("overview") or "")[:200],
                            "rating": str(round(s.get("vote_average", 0), 1)),
                            "poster": poster,
                            "tmdb_id": str(s.get("id", "")),
                            "torrent_query": f"{s_title} S01 complete",
                        }
                    )

    return tmdb_results, seen_tmdb


def enrich_with_posters(results: list, max_items: int = 20) -> list:
    def _fetch_poster(movie):
        m = dict(movie)
        if m.get("tmdb_id") and not m.get("poster"):
            try:
                t = "tv" if m.get("type") == "series" else "movie"
                data = fetch(f"/{t}/{m['tmdb_id']}")
                if data:
                    if data.get("poster_path"):
                        m["poster"] = f"/api/tmdb-image/w300{data['poster_path']}"
                    if data.get("vote_average"):
                        m["rating"] = round(data["vote_average"], 1)
                    if data.get("overview") and not m.get("description"):
                        m["description"] = data["overview"][:150]
            except Exception:
                pass
        return m

    items = results[:max_items]
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        return list(pool.map(_fetch_poster, items))


def get_recommendations_for_item(title: str, media_type: str = "movie") -> list:
    kind = "tv" if media_type in ("series", "tv") else "movie"
    search = fetch(f"/search/{kind}?query={urllib.parse.quote(title)}")
    if not search.get("results"):
        return []
    tmdb_id = search["results"][0].get("id")
    if not tmdb_id:
        return []
    recs = fetch(f"/{kind}/{tmdb_id}/recommendations")
    results = []
    for s in recs.get("results", [])[:10]:
        s_title = s.get("title") or s.get("name", "")
        year = (s.get("release_date") or s.get("first_air_date") or "")[:4]
        poster = f"/api/tmdb-image/w300{s['poster_path']}" if s.get("poster_path") else ""
        s_type = "series" if kind == "tv" else "movie"
        results.append(
            {
                "title": s_title,
                "year": year,
                "type": s_type,
                "description": (s.get("overview") or "")[:200],
                "rating": str(round(s.get("vote_average", 0), 1)),
                "poster": poster,
                "tmdb_id": str(s.get("id", "")),
                "torrent_query": f"{s_title} {year}".strip(),
                "genre_ids": s.get("genre_ids", []),
            }
        )
    return results


def discover_by_genres(genre_ids: list, media_type: str = "movie", page: int = 1) -> list:
    kind = "tv" if media_type in ("series", "tv") else "movie"
    genres_str = ",".join(str(g) for g in genre_ids)
    data = fetch(f"/discover/{kind}?with_genres={genres_str}&sort_by=vote_average.desc&vote_count.gte=100&page={page}")
    results = []
    for s in data.get("results", [])[:20]:
        s_title = s.get("title") or s.get("name", "")
        year = (s.get("release_date") or s.get("first_air_date") or "")[:4]
        poster = f"/api/tmdb-image/w300{s['poster_path']}" if s.get("poster_path") else ""
        s_type = "series" if kind == "tv" else "movie"
        results.append(
            {
                "title": s_title,
                "year": year,
                "type": s_type,
                "description": (s.get("overview") or "")[:200],
                "rating": str(round(s.get("vote_average", 0), 1)),
                "poster": poster,
                "tmdb_id": str(s.get("id", "")),
                "torrent_query": f"{s_title} {year}".strip(),
                "genre_ids": s.get("genre_ids", []),
            }
        )
    return results


def multi_search(query: str) -> list:
    encoded = urllib.parse.quote(query)
    results = []
    seen = set()

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        f_movies = pool.submit(fetch, f"/search/movie?query={encoded}")
        f_tv = pool.submit(fetch, f"/search/tv?query={encoded}")

    for item in f_movies.result().get("results", []):
        title = item.get("title", "")
        if not title:
            continue
        tmdb_id = str(item.get("id", ""))
        if tmdb_id in seen:
            continue
        seen.add(tmdb_id)
        year = (item.get("release_date") or "")[:4]
        poster = f"/api/tmdb-image/w500{item['poster_path']}" if item.get("poster_path") else ""
        results.append(
            {
                "title": title,
                "year": year,
                "tmdb_id": tmdb_id,
                "type": "movie",
                "poster": poster,
                "rating": round(item.get("vote_average", 0), 1),
                "overview": (item.get("overview") or "")[:150],
            }
        )

    for item in f_tv.result().get("results", []):
        title = item.get("name", "")
        if not title:
            continue
        tmdb_id = str(item.get("id", ""))
        if tmdb_id in seen:
            continue
        seen.add(tmdb_id)
        year = (item.get("first_air_date") or "")[:4]
        poster = f"/api/tmdb-image/w500{item['poster_path']}" if item.get("poster_path") else ""
        results.append(
            {
                "title": title,
                "year": year,
                "tmdb_id": tmdb_id,
                "type": "series",
                "poster": poster,
                "rating": round(item.get("vote_average", 0), 1),
                "overview": (item.get("overview") or "")[:150],
            }
        )

    return results[:20]


def get_detail(tmdb_id: str, media_type: str = "movie") -> dict:
    kind = "tv" if media_type in ("tv", "series") else "movie"

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        f_details = pool.submit(fetch, f"/{kind}/{tmdb_id}")
        f_credits = pool.submit(fetch, f"/{kind}/{tmdb_id}/credits")
        f_similar = pool.submit(fetch, f"/{kind}/{tmdb_id}/recommendations")
        f_external = pool.submit(fetch, f"/{kind}/{tmdb_id}/external_ids")
        f_videos = pool.submit(fetch, f"/{kind}/{tmdb_id}/videos")

    details = f_details.result()
    credits = f_credits.result()
    similar_data = f_similar.result()
    external_ids = f_external.result()
    videos_data = f_videos.result()

    if not details or "id" not in details:
        return {"error": "Movie/series not found on TMDB"}

    title = details.get("title") or details.get("name") or ""
    release_date = details.get("release_date") or details.get("first_air_date") or ""
    year = release_date[:4] if release_date else ""

    director = ""
    for crew_member in credits.get("crew", []):
        if crew_member.get("job") == "Director":
            director = crew_member.get("name", "")
            break
    if not director and kind == "tv":
        creators = details.get("created_by", [])
        if creators:
            director = creators[0].get("name", "")

    cast = []
    for member in credits.get("cast", [])[:10]:
        photo = ""
        if member.get("profile_path"):
            photo = f"/api/tmdb-image/w185{member['profile_path']}"
        cast.append(
            {
                "name": member.get("name", ""),
                "character": member.get("character", ""),
                "photo": photo,
            }
        )

    poster = f"/api/tmdb-image/w500{details['poster_path']}" if details.get("poster_path") else ""
    backdrop = f"/api/tmdb-image/w1280{details['backdrop_path']}" if details.get("backdrop_path") else ""

    genres = [g.get("name", "") for g in details.get("genres", [])]

    runtime = details.get("runtime") or 0
    if not runtime and kind == "tv":
        ert = details.get("episode_run_time", [])
        runtime = ert[0] if ert else 0

    similar_tmdb = []
    for s in similar_data.get("results", [])[:10]:
        s_title = s.get("title") or s.get("name") or ""
        s_date = s.get("release_date") or s.get("first_air_date") or ""
        s_year = s_date[:4] if s_date else ""
        s_poster = f"/api/tmdb-image/w500{s['poster_path']}" if s.get("poster_path") else ""
        s_type = "tv" if s.get("name") and not s.get("title") else "movie"
        similar_tmdb.append(
            {
                "title": s_title,
                "year": s_year,
                "tmdb_id": str(s.get("id", "")),
                "poster": s_poster,
                "rating": round(s.get("vote_average", 0), 1),
                "type": s_type,
            }
        )

    return {
        "title": title,
        "year": year,
        "overview": details.get("overview", ""),
        "poster": poster,
        "backdrop": backdrop,
        "genres": genres,
        "runtime": runtime,
        "rating": round(details.get("vote_average", 0), 1),
        "vote_count": details.get("vote_count", 0),
        "cast": cast,
        "director": director,
        "tagline": details.get("tagline", ""),
        "status": details.get("status", ""),
        "tmdb_id": str(tmdb_id),
        "type": kind,
        "original_language": details.get("original_language", ""),
        "torrent_query": f"{title} S01 complete" if kind == "tv" else f"{title} {year}".strip(),
        "imdb_id": external_ids.get("imdb_id", ""),
        "trailers": _extract_trailers(videos_data),
        "similar_tmdb": similar_tmdb,
    }


def _extract_trailers(videos_data: dict) -> list:
    """Extract YouTube trailers from TMDB videos response, best first."""
    trailers = []
    for v in videos_data.get("results", []):
        if v.get("site") == "YouTube" and v.get("key"):
            trailers.append(
                {
                    "key": v["key"],
                    "name": v.get("name", "Trailer"),
                    "type": v.get("type", ""),
                    "official": v.get("official", False),
                }
            )
    # Sort: official trailers first, then teasers, then others
    type_order = {"Trailer": 0, "Teaser": 1, "Clip": 2, "Featurette": 3}
    trailers.sort(key=lambda t: (not t["official"], type_order.get(t["type"], 9)))
    return trailers[:5]


def get_external_ids(tmdb_id: str, media_type: str = "movie") -> dict:
    """Get external IDs (IMDB, etc.) for a TMDB item."""
    kind = "tv" if media_type in ("tv", "series") else "movie"
    data = fetch(f"/{kind}/{tmdb_id}/external_ids")
    return {
        "imdb_id": data.get("imdb_id", ""),
    }


def get_trending(time_window: str = "week") -> list:
    results = []
    seen = set()

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        f_movies = pool.submit(fetch, f"/trending/movie/{time_window}")
        f_tv = pool.submit(fetch, f"/trending/tv/{time_window}")

    for item in f_movies.result().get("results", [])[:20]:
        title = item.get("title", "")
        key = title.lower()
        if key and key not in seen:
            seen.add(key)
            year = (item.get("release_date") or "")[:4]
            poster = f"/api/tmdb-image/w300{item['poster_path']}" if item.get("poster_path") else ""
            results.append(
                {
                    "title": title,
                    "year": year,
                    "type": "movie",
                    "description": (item.get("overview") or "")[:200],
                    "rating": str(round(item.get("vote_average", 0), 1)),
                    "poster": poster,
                    "tmdb_id": str(item.get("id", "")),
                    "torrent_query": f"{title} {year}".strip(),
                    "genre_ids": item.get("genre_ids", []),
                }
            )

    for item in f_tv.result().get("results", [])[:20]:
        title = item.get("name", "")
        key = title.lower()
        if key and key not in seen:
            seen.add(key)
            year = (item.get("first_air_date") or "")[:4]
            poster = f"/api/tmdb-image/w300{item['poster_path']}" if item.get("poster_path") else ""
            results.append(
                {
                    "title": title,
                    "year": year,
                    "type": "series",
                    "description": (item.get("overview") or "")[:200],
                    "rating": str(round(item.get("vote_average", 0), 1)),
                    "poster": poster,
                    "tmdb_id": str(item.get("id", "")),
                    "torrent_query": f"{title} S01 complete",
                    "genre_ids": item.get("genre_ids", []),
                }
            )

    return results
