import json
import re
import urllib.parse

import httpx

from app.config import settings

_sid: str | None = None
_client = httpx.Client(timeout=10)


def _login() -> bool:
    global _sid
    try:
        resp = _client.post(
            f"{settings.qbit_base}/auth/login",
            data={"username": settings.qbit_user, "password": settings.qbit_pass},
        )
        sid = resp.cookies.get("SID")
        if sid:
            _sid = sid
            return True
    except Exception:
        pass
    return False


def request(path: str, method: str = "GET", body: str | None = None, retry: bool = True) -> dict | list:
    global _sid
    if not _sid:
        _login()
    url = f"{settings.qbit_base}{path}"
    try:
        headers = {}
        if _sid:
            headers["Cookie"] = f"SID={_sid}"
        if method == "GET":
            resp = _client.get(url, headers=headers)
        else:
            content_headers = {**headers, "Content-Type": "application/x-www-form-urlencoded"}
            resp = _client.post(url, headers=content_headers, content=body)
        if resp.status_code == 403 and retry:
            _login()
            return request(path, method, body, retry=False)
        if resp.status_code >= 400:
            return {"error": f"qBittorrent HTTP {resp.status_code}"}
        raw = resp.text.strip()
        if raw:
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return {"ok": True, "message": raw}
        return {"ok": True}
    except Exception as e:
        return {"error": f"qBittorrent: {e}"}


def _clean_query(query: str) -> str:
    """Strip special characters that break torrent search APIs."""
    cleaned = re.sub(r"[''\",:!?()&]", " ", query)
    return re.sub(r"\s+", " ", cleaned).strip()


def _clean_query_variants(query: str) -> list[str]:
    """Return a list of query variants to try, most specific first."""
    clean = _clean_query(query)
    variants = [clean]
    # Strip "S01 complete" and try just the title
    alt = re.sub(r"\s+S\d{1,2}\s+complete", "", clean, flags=re.IGNORECASE).strip()
    if alt != clean:
        variants.append(alt)
    # Try with "season 1" instead
    if re.search(r"S\d{1,2}", clean, re.IGNORECASE):
        alt2 = re.sub(r"S(\d{1,2})\s*complete", r"season \1", clean, flags=re.IGNORECASE).strip()
        if alt2 not in variants:
            variants.append(alt2)
    return variants


def _search_apibay(query: str) -> list:
    """Search apibay for a single query. Returns list of result dicts."""
    try:
        with httpx.Client(timeout=15) as client:
            resp = client.get(
                f"https://apibay.org/q.php?q={urllib.parse.quote(query)}",
                headers={"User-Agent": "Mozilla/5.0"},
            )
        results = resp.json()
        if not isinstance(results, list):
            return []
        filtered = []
        for r in results[:20]:
            if r.get("id") == "0" or r.get("name") == "No results returned":
                continue
            filtered.append(
                {
                    "name": r.get("name", "Unknown"),
                    "size": int(r.get("size", 0)),
                    "seeders": int(r.get("seeders", 0)),
                    "leechers": int(r.get("leechers", 0)),
                    "info_hash": r.get("info_hash", ""),
                    "added": r.get("added", ""),
                    "category": r.get("category", ""),
                }
            )
        return filtered
    except Exception:
        return []


def search_torrents(query: str) -> dict | list:
    try:
        variants = _clean_query_variants(query)

        for variant in variants:
            results = _search_apibay(variant)
            if results:
                results.sort(key=lambda x: x["seeders"], reverse=True)
                return results

        return []
    except Exception as e:
        return {"error": str(e)}


_CATEGORY_PATHS = {
    "tv": "/media/tv",
    "movies": "/media/movies",
    "anime": "/media/anime",
    "music": "/media/music",
}


def add_torrent(magnet: str, category: str = "") -> dict:
    if not magnet.startswith("magnet:"):
        return {"error": "Invalid magnet link"}
    # Auto-detect category from magnet display name if not provided
    if not category:
        dn_match = re.search(r"dn=([^&]+)", magnet)
        if dn_match:
            dn = urllib.parse.unquote(dn_match.group(1))
            if re.search(r"\bS\d{1,2}|[Ss]eason\s*\d", dn):
                category = "tv"
            else:
                category = "movies"
    # Explicitly set save path based on category (qBit doesn't always respect category savePath)
    save_path = _CATEGORY_PATHS.get(category, "")
    params = {"urls": magnet, "category": category}
    if save_path:
        params["savepath"] = save_path
    post_data = urllib.parse.urlencode(params)
    return request("/torrents/add", method="POST", body=post_data)


def clean_completed() -> dict:
    try:
        torrents = request("/torrents/info")
        if not isinstance(torrents, list):
            if isinstance(torrents, dict) and torrents.get("error"):
                return torrents
            return {"error": "Unexpected qBittorrent response"}
        cleaned = []
        for t in torrents:
            if t.get("progress", 0) >= 1.0 and t.get("state", "") in (
                "pausedUP",
                "stalledUP",
                "uploading",
                "stoppedUP",
                "forcedUP",
                "queuedUP",
                "checkingUP",
            ):
                h = t.get("hash", "")
                if h:
                    del_body = urllib.parse.urlencode({"hashes": h, "deleteFiles": "false"})
                    request("/torrents/delete", method="POST", body=del_body)
                    cleaned.append(t.get("name", h))
        if cleaned:
            return {
                "ok": True,
                "message": f"Removed {len(cleaned)} completed: {', '.join(cleaned[:3])}{'...' if len(cleaned) > 3 else ''}",
            }
        return {"ok": True, "message": "No completed torrents to clean"}
    except Exception as e:
        return {"error": str(e)}


def get_torrents() -> list:
    """Get all torrents in normalized format."""
    torrents = request("/torrents/info")
    if not isinstance(torrents, list):
        if isinstance(torrents, dict) and torrents.get("error"):
            return torrents
        return {"error": "Unexpected qBittorrent response"}
    return [_normalize_torrent(t) for t in torrents]


def get_transfer_info() -> dict:
    """Get transfer info in normalized format."""
    data = request("/transfer/info")
    if isinstance(data, dict) and data.get("error"):
        return data
    return {
        "dl_info_speed": data.get("dl_info_speed", 0),
        "up_info_speed": data.get("up_info_speed", 0),
    }


def pause_torrent(hashes: list[str]) -> dict:
    body = urllib.parse.urlencode({"hashes": "|".join(hashes)})
    return request("/torrents/stop", method="POST", body=body)


def resume_torrent(hashes: list[str]) -> dict:
    body = urllib.parse.urlencode({"hashes": "|".join(hashes)})
    return request("/torrents/start", method="POST", body=body)


def delete_torrent(hashes: list[str], delete_files: bool = False) -> dict:
    body = urllib.parse.urlencode({"hashes": "|".join(hashes), "deleteFiles": "true" if delete_files else "false"})
    return request("/torrents/delete", method="POST", body=body)


def _normalize_torrent(t: dict) -> dict:
    """Convert qBittorrent torrent to normalized format."""
    return {
        "hash": t.get("hash", ""),
        "name": t.get("name", "Unknown"),
        "size": t.get("size", 0),
        "progress": t.get("progress", 0),
        "dlspeed": t.get("dlspeed", 0),
        "upspeed": t.get("upspeed", 0),
        "eta": t.get("eta", 0),
        "state": t.get("state", "unknown"),
        "category": t.get("category", ""),
        "save_path": t.get("save_path", ""),
    }
