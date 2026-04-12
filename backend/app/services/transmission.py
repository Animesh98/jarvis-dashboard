import re
import urllib.parse

import httpx

from app.config import settings

_session_id: str | None = None
_client = httpx.Client(timeout=10)

# Transmission status codes → qBit-compatible state strings
_STATUS_MAP = {
    0: "stopped",  # Stopped
    1: "checkingDL",  # Check pending
    2: "checkingDL",  # Checking
    3: "queuedDL",  # Download pending
    4: "downloading",  # Downloading
    5: "queuedUP",  # Seed pending
    6: "uploading",  # Seeding
}

_CATEGORY_PATHS = {
    "tv": "/media/tv",
    "movies": "/media/movies",
    "anime": "/media/anime",
    "music": "/media/music",
}

_TORRENT_FIELDS = [
    "id",
    "hashString",
    "name",
    "percentDone",
    "status",
    "totalSize",
    "rateDownload",
    "rateUpload",
    "eta",
    "downloadDir",
    "labels",
    "isFinished",
    "sizeWhenDone",
    "leftUntilDone",
    "error",
    "errorString",
]


def _rpc(method: str, arguments: dict | None = None, retry: bool = True) -> dict:
    """Make a Transmission RPC call, handling session-id negotiation."""
    global _session_id
    payload = {"method": method}
    if arguments:
        payload["arguments"] = arguments
    headers = {}
    if _session_id:
        headers["X-Transmission-Session-Id"] = _session_id
    auth = None
    if settings.transmission_user:
        auth = (settings.transmission_user, settings.transmission_pass)
    try:
        resp = _client.post(settings.transmission_base, json=payload, headers=headers, auth=auth)
        if resp.status_code == 409 and retry:
            _session_id = resp.headers.get("X-Transmission-Session-Id")
            return _rpc(method, arguments, retry=False)
        if resp.status_code != 200:
            return {"error": f"Transmission HTTP {resp.status_code}"}
        return resp.json()
    except Exception as e:
        return {"error": f"Transmission: {e}"}


def _state_string(t: dict) -> str:
    """Convert Transmission status to a qBit-compatible state string."""
    status = t.get("status", 0)
    base = _STATUS_MAP.get(status, "unknown")
    if status == 0:
        done = t.get("percentDone", 0) >= 1.0
        return "stoppedUP" if done else "stoppedDL"
    return base


def _category_from_labels(t: dict) -> str:
    """Extract category from Transmission labels."""
    labels = t.get("labels") or []
    for label in labels:
        if label.lower() in _CATEGORY_PATHS:
            return label.lower()
    return ""


def _normalize_torrent(t: dict) -> dict:
    """Convert a Transmission torrent to qBit-compatible dict."""
    return {
        "hash": t.get("hashString", ""),
        "name": t.get("name", "Unknown"),
        "size": t.get("totalSize", 0),
        "progress": t.get("percentDone", 0),
        "dlspeed": t.get("rateDownload", 0),
        "upspeed": t.get("rateUpload", 0),
        "eta": t.get("eta", -1) if t.get("eta", -1) >= 0 else 0,
        "state": _state_string(t),
        "category": _category_from_labels(t),
        "save_path": t.get("downloadDir", ""),
    }


def get_torrents() -> list:
    """Get all torrents in normalized format."""
    resp = _rpc("torrent-get", {"fields": _TORRENT_FIELDS})
    if resp.get("error"):
        return resp
    torrents = resp.get("arguments", {}).get("torrents", [])
    return [_normalize_torrent(t) for t in torrents]


def get_transfer_info() -> dict:
    """Get session stats in qBit-compatible transfer format."""
    resp = _rpc("session-stats")
    if resp.get("error"):
        return resp
    args = resp.get("arguments", {})
    return {
        "dl_info_speed": args.get("downloadSpeed", 0),
        "up_info_speed": args.get("uploadSpeed", 0),
    }


def add_torrent(magnet: str, category: str = "") -> dict:
    if not magnet.startswith("magnet:"):
        return {"error": "Invalid magnet link"}
    if not category:
        dn_match = re.search(r"dn=([^&]+)", magnet)
        if dn_match:
            dn = urllib.parse.unquote(dn_match.group(1))
            if re.search(r"\bS\d{1,2}|[Ss]eason\s*\d", dn):
                category = "tv"
            else:
                category = "movies"
    args: dict = {"filename": magnet}
    save_path = _CATEGORY_PATHS.get(category, "")
    if save_path:
        args["download-dir"] = save_path
    if category:
        args["labels"] = [category]
    resp = _rpc("torrent-add", args)
    if resp.get("error"):
        return resp
    result = resp.get("arguments", {})
    if "torrent-added" in result:
        return {"ok": True, "message": f"Added: {result['torrent-added'].get('name', 'torrent')}"}
    if "torrent-duplicate" in result:
        return {"ok": True, "message": "Torrent already exists"}
    return {"ok": True}


def pause_torrent(hashes: list[str]) -> dict:
    ids = _resolve_ids(hashes)
    if not ids:
        return {"error": "Torrent not found"}
    resp = _rpc("torrent-stop", {"ids": ids})
    return {"ok": True} if not resp.get("error") else resp


def resume_torrent(hashes: list[str]) -> dict:
    ids = _resolve_ids(hashes)
    if not ids:
        return {"error": "Torrent not found"}
    resp = _rpc("torrent-start", {"ids": ids})
    return {"ok": True} if not resp.get("error") else resp


def delete_torrent(hashes: list[str], delete_files: bool = False) -> dict:
    ids = _resolve_ids(hashes)
    if not ids:
        return {"error": "Torrent not found"}
    resp = _rpc(
        "torrent-remove",
        {
            "ids": ids,
            "delete-local-data": delete_files,
        },
    )
    return {"ok": True} if not resp.get("error") else resp


def clean_completed() -> dict:
    torrents = get_torrents()
    if isinstance(torrents, dict) and torrents.get("error"):
        return torrents
    cleaned = []
    for t in torrents:
        if t.get("progress", 0) >= 1.0 and t.get("state") in ("uploading", "stoppedUP", "queuedUP"):
            h = t.get("hash", "")
            if h:
                delete_torrent([h], delete_files=False)
                cleaned.append(t.get("name", h))
    if cleaned:
        return {
            "ok": True,
            "message": f"Removed {len(cleaned)} completed: {', '.join(cleaned[:3])}{'...' if len(cleaned) > 3 else ''}",
        }
    return {"ok": True, "message": "No completed torrents to clean"}


def _resolve_ids(hashes: list[str]) -> list[int]:
    """Resolve info hashes to Transmission torrent IDs."""
    resp = _rpc("torrent-get", {"fields": ["id", "hashString"]})
    if resp.get("error"):
        return []
    all_t = resp.get("arguments", {}).get("torrents", [])
    hash_set = {h.lower() for h in hashes}
    return [t["id"] for t in all_t if t.get("hashString", "").lower() in hash_set]
