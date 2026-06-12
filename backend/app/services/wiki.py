import datetime
import re
import threading
import time

import httpx

_wiki_kb: dict = {"categories": {}, "top100": [], "ts": 0}
_wiki_kb_lock = threading.Lock()
_wiki_kb_refreshing = False
_WIKI_KB_TTL = 86400

_http = httpx.Client(
    timeout=20,
    headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json,text/html,*/*",
        "Accept-Language": "en-US,en;q=0.5",
    },
)


def _reddit_wiki_json(page: str) -> dict:
    url = f"https://old.reddit.com/r/MovieSuggestions/wiki/{page}.json"
    resp = _http.get(url)
    return resp.json()


def _parse_wiki_movies(content_md: str) -> dict:
    categories = {}
    current_category = None
    current_top_category = None

    movie_re = re.compile(
        r"\[([^\]]+?)\s*\((\d{4})\)\]\((https?://(?:www\.)?themoviedb\.org/(?:movie|tv)/(\d+)[^)]*)\)"
    )
    header_re = re.compile(r"^(#{1,4})\s*(.+)")

    for line in content_md.split("\n"):
        header_match = header_re.match(line.strip())
        if header_match:
            level = len(header_match.group(1))
            name = header_match.group(2).strip().rstrip("#").strip()
            name = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", name)
            name = re.sub(r"[*_`]", "", name).strip()
            if not name:
                continue
            if level == 1:
                current_top_category = name
                current_category = name
            else:
                current_category = f"{current_top_category} > {name}" if current_top_category else name
            if current_category not in categories:
                categories[current_category] = []
            continue

        for match in movie_re.finditer(line):
            title = re.sub(r"[*_`]", "", match.group(1)).strip()
            year = match.group(2)
            tmdb_url = match.group(3)
            tmdb_id = match.group(4)
            media_type = "series" if "/tv/" in tmdb_url else "movie"
            entry = {
                "title": title,
                "year": year,
                "type": media_type,
                "tmdb_id": tmdb_id,
                "tmdb_url": tmdb_url,
                "category": current_category or "Uncategorized",
                "torrent_query": f"{title} {year}".strip(),
            }
            if current_category and current_category in categories:
                categories[current_category].append(entry)
            else:
                categories.setdefault("Uncategorized", []).append(entry)

    return categories


def _parse_top100_movies(content_md: str) -> list:
    movies = []
    seen = set()
    tmdb_re = re.compile(r"\[([^\]]+?)\s*\((\d{4})\)\]\((https?://(?:www\.)?themoviedb\.org/(?:movie|tv)/(\d+)[^)]*)\)")
    table_re = re.compile(r"\|\s*\d+\s*\|\s*(.+?)\s*\((\d{4})\)\s*\|")

    for line in content_md.split("\n"):
        for match in tmdb_re.finditer(line):
            title = re.sub(r"[*_`]", "", match.group(1)).strip()
            year = match.group(2)
            tmdb_url = match.group(3)
            tmdb_id = match.group(4)
            media_type = "series" if "/tv/" in tmdb_url else "movie"
            key = title.lower()
            if key not in seen:
                seen.add(key)
                movies.append(
                    {
                        "title": title,
                        "year": year,
                        "type": media_type,
                        "tmdb_id": tmdb_id,
                        "tmdb_url": tmdb_url,
                        "category": "Trending",
                        "torrent_query": f"{title} {year}".strip(),
                    }
                )
        for match in table_re.finditer(line):
            title = re.sub(r"[*_`]", "", match.group(1)).strip()
            year = match.group(2)
            key = title.lower()
            if key not in seen:
                seen.add(key)
                movies.append(
                    {
                        "title": title,
                        "year": year,
                        "type": "movie",
                        "tmdb_id": "",
                        "tmdb_url": "",
                        "category": "Trending",
                        "torrent_query": f"{title} {year}".strip(),
                    }
                )
    return movies


def _get_top100_page_names() -> list:
    # Walk back calendar months properly — subtracting 30-day blocks can
    # duplicate a month (May 31 − 30d = May 1) and skip the one before it
    now = datetime.datetime.now()
    year, month = now.year, now.month
    months = []
    for _ in range(3):
        month_name = datetime.date(year, month, 1).strftime("%B").lower()
        months.append(f"meta/top100/{month_name}{year}")
        month -= 1
        if month == 0:
            month, year = 12, year - 1
    return months


def _load_knowledge_base():
    global _wiki_kb_refreshing
    now = time.time()
    with _wiki_kb_lock:
        if _wiki_kb["ts"] and (now - _wiki_kb["ts"]) < _WIKI_KB_TTL and _wiki_kb["categories"]:
            return
        if _wiki_kb_refreshing:
            # Another thread is already re-fetching the wiki — serve the
            # current (possibly stale) copy instead of fetching in parallel
            return
        _wiki_kb_refreshing = True

    try:
        _refresh_knowledge_base()
    finally:
        with _wiki_kb_lock:
            _wiki_kb_refreshing = False


def _refresh_knowledge_base():
    categories = {}
    top100 = []

    try:
        data = _reddit_wiki_json("frequently_requested")
        content = data.get("data", {}).get("content_md", "") or data.get("data", {}).get("content_html", "")
        if not content:
            content = data.get("data", {}).get("body", "") or data.get("data", {}).get("body_md", "")
        if content:
            categories = _parse_wiki_movies(content)
    except Exception as e:
        print(f"[Wiki] Failed to fetch frequently_requested: {e}")

    try:
        data = _reddit_wiki_json("faq/horror")
        content = data.get("data", {}).get("content_md", "") or data.get("data", {}).get("content_html", "")
        if not content:
            content = data.get("data", {}).get("body", "") or data.get("data", {}).get("body_md", "")
        if content:
            horror_cats = _parse_wiki_movies(content)
            for cat, movies in horror_cats.items():
                cat_key = f"Horror - {cat}" if cat != "Uncategorized" else "Horror (FAQ)"
                categories[cat_key] = movies
    except Exception:
        pass

    for page_name in _get_top100_page_names():
        try:
            data = _reddit_wiki_json(page_name)
            content = data.get("data", {}).get("content_md", "") or data.get("data", {}).get("content_html", "")
            if not content:
                content = data.get("data", {}).get("body", "") or data.get("data", {}).get("body_md", "")
            if content:
                movies = _parse_top100_movies(content)
                top100.extend(movies)
        except Exception:
            pass

    seen = set()
    deduped = []
    for m in top100:
        key = m["title"].lower()
        if key not in seen:
            seen.add(key)
            deduped.append(m)

    with _wiki_kb_lock:
        _wiki_kb["categories"] = categories
        _wiki_kb["top100"] = deduped
        _wiki_kb["ts"] = time.time()

    total = sum(len(v) for v in categories.values())
    print(f"[Wiki] KB loaded: {len(categories)} categories, {total} movies, {len(deduped)} top100")


def get_kb() -> tuple[dict, list]:
    _load_knowledge_base()
    with _wiki_kb_lock:
        return _wiki_kb["categories"], _wiki_kb["top100"]
