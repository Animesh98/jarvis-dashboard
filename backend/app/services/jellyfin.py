import httpx

from app.config import settings

_client = httpx.Client(timeout=10)


def request(path: str) -> dict | list:
    sep = "&" if "?" in path else "?"
    url = f"{settings.jellyfin_base}{path}{sep}api_key={settings.jellyfin_api_key}"
    try:
        resp = _client.get(url)
        return resp.json()
    except httpx.HTTPStatusError as e:
        return {"error": f"Jellyfin returned {e.response.status_code}"}
    except Exception as e:
        return {"error": f"Jellyfin: {e}"}


def scan_library() -> dict:
    try:
        url = f"{settings.jellyfin_base}/Library/Refresh?api_key={settings.jellyfin_api_key}"
        _client.post(url)
        return {"ok": True, "message": "Library scan started"}
    except Exception as e:
        return {"error": str(e)}


def delete_item(item_id: str) -> dict:
    """Delete an item (movie/series/episode) from Jellyfin AND its media files
    from disk. Requires the configured API key's user to have content-deletion
    rights. Deleting a series removes all of its episodes."""
    try:
        url = f"{settings.jellyfin_base}/Items/{item_id}?api_key={settings.jellyfin_api_key}"
        resp = _client.delete(url)
        if resp.status_code in (200, 204):
            return {"ok": True}
        if resp.status_code in (401, 403):
            return {"error": "Jellyfin denied deletion — enable content deletion for this user"}
        if resp.status_code == 404:
            return {"error": "Item not found"}
        return {"error": f"Jellyfin returned {resp.status_code}"}
    except Exception as e:
        return {"error": f"Jellyfin: {e}"}
