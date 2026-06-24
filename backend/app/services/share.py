"""
Share service — mint expiring, signed public links for a single movie/episode
and proxy its Jellyfin HLS stream so a non-technical recipient can watch it in
any browser, anywhere, with no Tailscale and no login.

Security model:
  - A share is an HMAC-signed token (secret = the dashboard API key) carrying the
    share id + expiry. The token is ALSO checked against the DB so it can be
    revoked and listed. Tampering, expiry, or revocation all fail closed.
  - Only three routes are public (see middleware allowlist): the player page,
    the HLS proxy, and the poster. Everything else still needs the API key.
  - The real Jellyfin API key is injected server-side on every upstream call and
    stripped from any playlist body, so the recipient never sees it.
"""

import base64
import hashlib
import hmac
import json
import re

from app.config import settings
from app.services import database as db_svc
from app.services import jellyfin as jellyfin_svc

# Jellyfin params that force a browser-friendly H.264/AAC HLS transcode (or a
# cheap stream-copy when the source is already H.264).
_TRANSCODE_PARAMS = {
    "VideoCodec": "h264",
    "AudioCodec": "aac",
    "SegmentContainer": "ts",
}


def enabled() -> bool:
    return bool(settings.public_share_base and settings.api_key and settings.jellyfin_api_key)


def _secret() -> bytes:
    return settings.api_key.encode()


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _sign(payload: dict) -> str:
    body = _b64(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    sig = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def _unsign(token: str) -> dict | None:
    try:
        body, sig = token.split(".", 1)
        expected = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        return json.loads(_unb64(body))
    except Exception:
        return None


def create(item_id: str, hours: int, now: int) -> dict:
    """Mint a share for a Jellyfin item. `now` is a unix timestamp (passed in
    so the service stays deterministic/testable)."""
    import secrets

    share_id = secrets.token_urlsafe(9)
    expires_at = now + hours * 3600
    meta = item_meta(item_id)
    db_svc.share_create(share_id, item_id, meta["title"], meta["poster_tag"], expires_at)
    token = _sign({"id": share_id, "exp": expires_at})
    return {
        "id": share_id,
        "token": token,
        "url": f"{settings.public_share_base.rstrip('/')}/w/{token}",
        "title": meta["title"],
        "expires_at": expires_at,
    }


def share_url(share_id: str, exp: int) -> str:
    """Rebuild the public link for an existing share (token is deterministic)."""
    token = _sign({"id": share_id, "exp": exp})
    return f"{settings.public_share_base.rstrip('/')}/w/{token}"


def resolve(token: str, now: int) -> dict | None:
    """Validate a token and return the live share row, or None. Checks signature,
    expiry, existence and revocation."""
    payload = _unsign(token)
    if not payload:
        return None
    if int(payload.get("exp", 0)) < now:
        return None
    row = db_svc.share_get(payload.get("id", ""))
    if not row or int(row["expires_at"]) < now:
        return None
    return row


def _user_id() -> str:
    users = jellyfin_svc.request("/Users")
    if isinstance(users, list) and users:
        return users[0].get("Id", "")
    return ""


def item_meta(item_id: str) -> dict:
    """Title / poster tag / year / runtime for an item."""
    uid = _user_id()
    path = f"/Users/{uid}/Items/{item_id}" if uid else f"/Items/{item_id}"
    item = jellyfin_svc.request(path)
    if not isinstance(item, dict):
        return {"title": "", "poster_tag": "", "year": "", "runtime_min": None}
    runtime = item.get("RunTimeTicks") or 0
    return {
        "title": item.get("Name", ""),
        "poster_tag": item.get("ImageTags", {}).get("Primary", ""),
        "year": str(item.get("ProductionYear", "")),
        "runtime_min": round(runtime / 600000000) if runtime else None,
    }


def hls_upstream_params(item_id: str, share_id: str, incoming: dict) -> dict:
    """Build the query params for an upstream Jellyfin HLS request. Forward the
    playlist-provided params, force a stable session, and inject the real key."""
    params = dict(incoming)
    params.pop("api_key", None)  # never trust/forward a client-supplied key
    params.setdefault("MediaSourceId", item_id)
    # Stable session per share so Jellyfin reuses one ffmpeg across segments.
    params.setdefault("PlaySessionId", share_id)
    params.setdefault("DeviceId", f"share-{share_id}")
    for k, v in _TRANSCODE_PARAMS.items():
        params.setdefault(k, v)
    params["api_key"] = settings.jellyfin_api_key
    return params


_API_KEY_RE = re.compile(r"[?&]?api_key=[^&\s\"']+")


def scrub_playlist(text: str) -> str:
    """Remove any api_key=... from an m3u8 body so it never reaches the client.
    The proxy re-injects the real key server-side on each segment fetch."""
    out = []
    for line in text.splitlines():
        if line and not line.startswith("#"):
            line = _API_KEY_RE.sub("", line)
            line = line.replace("?&", "?").rstrip("?&")
        out.append(line)
    return "\n".join(out) + "\n"


def jellyfin_base() -> str:
    return settings.jellyfin_base.rstrip("/")
