"""External ratings service: IMDB (via OMDb) and Letterboxd (via scraping)."""

import concurrent.futures
import re
import time

import httpx

from app.config import settings

_client = httpx.Client(
    timeout=10,
    headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/json",
    },
)

# Cache: {cache_key: {"data": ..., "ts": float}}
_cache: dict = {}
_CACHE_TTL = 86400 * 3  # 3 days — ratings barely change


def _get_cached(key: str) -> dict | None:
    entry = _cache.get(key)
    if entry and (time.time() - entry["ts"]) < _CACHE_TTL:
        return entry["data"]
    return None


def _set_cache(key: str, data: dict):
    _cache[key] = {"data": data, "ts": time.time()}


def get_imdb_rating(imdb_id: str) -> dict:
    """Fetch IMDB rating via OMDb API. Returns {rating, votes, url}."""
    if not imdb_id or not settings.omdb_api_key:
        return {}

    cached = _get_cached(f"imdb:{imdb_id}")
    if cached is not None:
        return cached

    try:
        resp = _client.get(
            f"https://www.omdbapi.com/?i={imdb_id}&apikey={settings.omdb_api_key}",
            headers={"Accept": "application/json"},
        )
        data = resp.json()
        if data.get("Response") == "True":
            result = {
                "rating": data.get("imdbRating", "N/A"),
                "votes": data.get("imdbVotes", ""),
                "url": f"https://www.imdb.com/title/{imdb_id}/",
            }
            _set_cache(f"imdb:{imdb_id}", result)
            return result
    except Exception as e:
        print(f"[Ratings] OMDb error for {imdb_id}: {e}")

    return {}


def _title_to_letterboxd_slug(title: str) -> str:
    """Convert movie title to Letterboxd URL slug."""
    slug = title.lower()
    # Remove content in parentheses
    slug = re.sub(r"\([^)]*\)", "", slug).strip()
    # Replace common characters
    slug = slug.replace("&", "and")
    slug = slug.replace("'", "")
    slug = slug.replace("'", "")
    # Replace non-alphanumeric with hyphens
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    # Clean up
    slug = slug.strip("-")
    slug = re.sub(r"-+", "-", slug)
    return slug


def get_letterboxd_rating(title: str, year: str = "") -> dict:
    """Scrape Letterboxd for rating. Returns {rating, url}."""
    if not title:
        return {}

    cache_key = f"lb:{title.lower()}:{year}"
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    slug = _title_to_letterboxd_slug(title)
    # Try with and without year suffix
    slugs_to_try = [slug]
    if year:
        slugs_to_try.append(f"{slug}-{year}")

    for s in slugs_to_try:
        url = f"https://letterboxd.com/film/{s}/"
        try:
            resp = _client.get(url, follow_redirects=True)
            if resp.status_code == 200:
                html = resp.text
                # Try JSON-LD aggregateRating
                rating_match = re.search(r'"ratingValue":\s*([0-9.]+)', html)
                if rating_match:
                    result = {
                        "rating": rating_match.group(1),
                        "url": url,
                    }
                    _set_cache(cache_key, result)
                    return result
                # Try twitter meta tag fallback
                meta_match = re.search(r'content="([0-9.]+)\s+out of\s+5"', html)
                if meta_match:
                    result = {
                        "rating": meta_match.group(1),
                        "url": url,
                    }
                    _set_cache(cache_key, result)
                    return result
                # Page exists but no rating yet — still return the URL
                result = {"rating": "", "url": url}
                _set_cache(cache_key, result)
                return result
        except Exception as e:
            print(f"[Ratings] Letterboxd error for {s}: {e}")
            continue

    return {}


def get_external_ratings(imdb_id: str, title: str, year: str = "") -> dict:
    """Fetch IMDB and Letterboxd ratings in parallel."""
    result = {"imdb": {}, "letterboxd": {}}

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        f_imdb = pool.submit(get_imdb_rating, imdb_id)
        f_lb = pool.submit(get_letterboxd_rating, title, year)

    result["imdb"] = f_imdb.result()
    result["letterboxd"] = f_lb.result()

    # Always include IMDB URL if we have the ID, even without OMDb key
    if imdb_id and not result["imdb"].get("url"):
        result["imdb"]["url"] = f"https://www.imdb.com/title/{imdb_id}/"

    return result
