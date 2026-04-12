"""AllAnime search service — checks anime availability on AllAnime.

Used to show a "Stream" link that redirects to the AllAnime website.
"""

import re
import time

import httpx

ALLANIME_API = "https://api.allanime.day/api"
ALLANIME_REFERER = "https://allmanga.to"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0"

_client = httpx.Client(
    timeout=15,
    headers={
        "User-Agent": USER_AGENT,
        "Referer": ALLANIME_REFERER,
        "Accept": "application/json",
    },
)

SEARCH_GQL = """query( $search: SearchInput $limit: Int $page: Int $translationType: VaildTranslationTypeEnumType $countryOrigin: VaildCountryOriginEnumType ) { shows( search: $search limit: $limit page: $page translationType: $translationType countryOrigin: $countryOrigin ) { edges { _id name availableEpisodes __typename } } }"""

# Cache
_cache: dict = {}
_CACHE_TTL = 3600


def _gql(query: str, variables: dict) -> dict:
    """Execute a GraphQL query against the AllAnime API."""
    try:
        import json

        resp = _client.get(
            ALLANIME_API,
            params={
                "query": query,
                "variables": json.dumps(variables),
            },
        )
        data = resp.json()
        return data.get("data", {})
    except Exception as e:
        print(f"[AllAnime] GraphQL error: {e}")
        return {}


def search(query: str, mode: str = "sub") -> list:
    """Search for anime titles. Returns list of {id, name, episodes_sub, episodes_dub}."""
    cache_key = f"search:{query.lower()}:{mode}"
    now = time.time()
    if cache_key in _cache and (now - _cache[cache_key]["ts"]) < _CACHE_TTL:
        return _cache[cache_key]["data"]

    variables = {
        "search": {"allowAdult": False, "allowUnknown": False, "query": query},
        "limit": 40,
        "page": 1,
        "translationType": mode,
        "countryOrigin": "ALL",
    }
    data = _gql(SEARCH_GQL, variables)
    edges = data.get("shows", {}).get("edges", [])

    results = []
    for edge in edges:
        eps = edge.get("availableEpisodes", {})
        if isinstance(eps, str):
            eps = {}
        results.append(
            {
                "id": edge.get("_id", ""),
                "name": edge.get("name", ""),
                "episodes_sub": eps.get("sub", 0) if isinstance(eps, dict) else 0,
                "episodes_dub": eps.get("dub", 0) if isinstance(eps, dict) else 0,
            }
        )

    _cache[cache_key] = {"data": results, "ts": now}
    return results


def check_availability(title: str) -> dict | None:
    """Check if a title is available on AllAnime. Returns best match or None."""
    results = search(title, "sub")
    if not results:
        results = search(title, "dub")
    if not results:
        return None

    title_lower = title.lower().strip()
    title_words = set(re.sub(r"[^\w\s]", "", title_lower).split())

    best = None
    best_score = -1

    for r in results:
        name_lower = r["name"].lower().strip()
        name_clean = re.sub(r"[^\w\s]", "", name_lower)
        name_words = set(name_clean.split())

        # Exact match
        if name_lower == title_lower or name_clean == re.sub(r"[^\w\s]", "", title_lower):
            return r

        score = 0
        # Full containment
        if title_lower in name_lower or name_lower in title_lower:
            score += 50
        # Word overlap ratio
        if title_words:
            overlap = len(title_words & name_words)
            score += (overlap / len(title_words)) * 40
        # Prefer entries with more episodes (likely the main series, not specials)
        total_eps = r["episodes_sub"] + r["episodes_dub"]
        if total_eps > 100:
            score += 15
        elif total_eps > 10:
            score += 8

        if score > best_score:
            best_score = score
            best = r

    # Also consider the entry with most episodes (often the main series has
    # a short/alternate name like "1P" for One Piece)
    if results:
        by_eps = max(results, key=lambda r: r["episodes_sub"] + r["episodes_dub"])
        top_eps = by_eps["episodes_sub"] + by_eps["episodes_dub"]
        best_eps = (best["episodes_sub"] + best["episodes_dub"]) if best else 0
        # If the top-episode entry has 5x+ more episodes, prefer it
        if top_eps > 0 and (not best or top_eps > best_eps * 5):
            return by_eps

    if best and best_score >= 30:
        return best

    return None
