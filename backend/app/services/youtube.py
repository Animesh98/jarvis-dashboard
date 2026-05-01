"""YouTube full-movie search service using yt-dlp.

Searches YouTube for a movie title, verifies the result is likely a full movie
by checking duration and metadata, and returns a direct YouTube watch URL.
"""

import re
import time

import yt_dlp

# Minimum duration (seconds) for a video to be considered a full movie
MIN_MOVIE_DURATION = 40 * 60  # 40 minutes

# Cache results to avoid repeated lookups
_cache: dict = {}
_CACHE_TTL = 3600  # 1 hour


# Quiet yt-dlp logger
class _QuietLogger:
    def debug(self, msg):
        pass

    def info(self, msg):
        pass

    def warning(self, msg):
        pass

    def error(self, msg):
        pass


def _extract_info(query: str) -> list[dict]:
    """Search YouTube and return metadata for top results (no download)."""
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "skip_download": True,
        "logger": _QuietLogger(),
        "socket_timeout": 15,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            result = ydl.extract_info(query, download=False)
            if not result:
                return []
            # Playlist-style search results
            if "entries" in result:
                return [e for e in result["entries"] if e]
            return [result]
    except Exception as e:
        print(f"[YouTube] yt-dlp error: {e}")
        return []


def _is_full_movie(entry: dict, title: str) -> bool:
    """Check if a YouTube video is likely the full movie."""
    duration = entry.get("duration") or 0
    if duration < MIN_MOVIE_DURATION:
        return False

    video_title = (entry.get("title") or "").lower()
    description = (entry.get("description") or "").lower()

    # Reject trailers, teasers, songs, scenes, reviews
    reject_patterns = [
        r"\btrailer\b",
        r"\bteaser\b",
        r"\bsong\b",
        r"\bjukebox\b",
        r"\bscene\b",
        r"\breview\b",
        r"\breaction\b",
        r"\bclip\b",
        r"\bbest scenes\b",
        r"\bost\b",
        r"\bsoundtrack\b",
        r"\blyrics?\b",
        r"\bbehind the scenes\b",
        r"\bmaking of\b",
    ]
    for pattern in reject_patterns:
        if re.search(pattern, video_title):
            return False

    # Positive signals in title/description
    positive_patterns = [
        r"\bfull movie\b",
        r"\bfull film\b",
        r"\bhd movie\b",
        r"\bhindi movie\b",
        r"\bbollywood\b",
        r"\bhollywood\b",
        r"\bsuperhit\b",
        r"\bblockbuster\b",
        r"\bnew movie\b",
        r"\baction movie\b",
        r"\b(dubbed|official)\b",
        r"\bfull hd\b",
        r"\bcomedy movie\b",
    ]
    positive_score = sum(1 for p in positive_patterns if re.search(p, video_title) or re.search(p, description))

    # Title similarity check
    search_lower = title.lower().strip()
    search_clean = re.sub(r"[^\w\s]", "", search_lower)
    search_words = set(search_clean.split())
    video_clean = re.sub(r"[^\w\s]", "", video_title)
    video_words = set(video_clean.split())

    if search_words:
        overlap = len(search_words & video_words) / len(search_words)
    else:
        overlap = 0

    # Check for sequel mismatch: if the video has a sequel number
    # (e.g. "2", "3", "part 2") that isn't in the search title, reject it
    sequel_indicators = re.findall(r"\b(?:part\s*)?(\d+)\b", video_clean)
    search_numbers = set(re.findall(r"\b(\d+)\b", search_clean))
    for num in sequel_indicators:
        if num not in search_numbers and num not in ("1", "4k", "1080", "720", "480", "2160"):
            # This video might be a different sequel
            if int(num) <= 20:  # Likely a sequel number, not a year/resolution
                return False

    # Must have decent title overlap OR positive signals
    if overlap >= 0.5 or positive_score >= 1:
        return True

    # Long video (>1h) with some title match is probably the movie
    if duration >= 60 * 60 and overlap >= 0.3:
        return True

    return False


def search_full_movie(title: str, year: str = "") -> dict | None:
    """Search YouTube for a full movie. Returns {url, title, duration, channel} or None."""
    cache_key = f"yt:{title.lower().strip()}:{year}"
    now = time.time()
    if cache_key in _cache and (now - _cache[cache_key]["ts"]) < _CACHE_TTL:
        return _cache[cache_key]["data"]

    # Build search query targeting full movies
    search_terms = f"{title}"
    if year:
        search_terms += f" {year}"
    search_terms += " full movie"

    query = f"ytsearch5:{search_terms}"
    entries = _extract_info(query)

    best = None
    for entry in entries:
        if _is_full_movie(entry, title):
            best = entry
            break

    if not best:
        _cache[cache_key] = {"data": None, "ts": now}
        return None

    result = {
        "url": f"https://www.youtube.com/watch?v={best['id']}",
        "title": best.get("title", ""),
        "duration": best.get("duration", 0),
        "channel": best.get("channel") or best.get("uploader") or "",
    }

    _cache[cache_key] = {"data": result, "ts": now}
    return result
