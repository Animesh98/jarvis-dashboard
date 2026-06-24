"""
Share router.

Authenticated (dashboard) endpoints mint/list/revoke share links.
Public endpoints (allowlisted in middleware, but token-gated here) serve the
standalone player, proxy the Jellyfin HLS stream, and serve the poster.
"""

import html
import time

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from pydantic import BaseModel

from app.config import settings
from app.services import database as db_svc
from app.services import share as share_svc

router = APIRouter(tags=["share"])

_client = httpx.Client(timeout=30)


# --- Authenticated endpoints (require API key via middleware) ---


class ShareCreateRequest(BaseModel):
    item_id: str
    hours: int = 48


class ShareRevokeRequest(BaseModel):
    id: str


@router.post("/api/share/create")
def create_share(body: ShareCreateRequest):
    if not share_svc.enabled():
        return {"error": "Sharing is not configured (set PUBLIC_SHARE_BASE in .env)"}
    hours = max(1, min(720, body.hours))  # clamp 1h..30d
    return share_svc.create(body.item_id, hours, int(time.time()))


@router.get("/api/share/list")
def list_shares():
    now = int(time.time())
    out = []
    for s in db_svc.share_list():
        expired = int(s["expires_at"]) < now
        out.append(
            {
                "id": s["id"],
                "item_id": s["item_id"],
                "title": s["title"],
                "expires_at": s["expires_at"],
                "expired": expired,
                "url": share_svc.share_url(s["id"], int(s["expires_at"])),
            }
        )
    return out


@router.post("/api/share/revoke")
def revoke_share(body: ShareRevokeRequest):
    return db_svc.share_revoke(body.id)


# --- Public endpoints (token-gated; allowlisted in middleware) ---


@router.get("/w/{token}", response_class=HTMLResponse)
def watch_page(token: str):
    row = share_svc.resolve(token, int(time.time()))
    if not row:
        return HTMLResponse(_expired_html(), status_code=410)
    title = html.escape(row["title"] or "Now playing")
    hls_url = f"/api/share/hls/{token}/main.m3u8"
    poster_url = f"/api/share/poster/{token}"
    return HTMLResponse(_player_html(title, hls_url, poster_url))


@router.get("/api/share/poster/{token}")
def share_poster(token: str):
    row = share_svc.resolve(token, int(time.time()))
    if not row:
        return Response(status_code=404)
    tag = row["poster_tag"] or ""
    url = (
        f"{share_svc.jellyfin_base()}/Items/{row['item_id']}/Images/Primary"
        f"?maxHeight=720&tag={tag}&quality=90&api_key={settings.jellyfin_api_key}"
    )
    try:
        resp = _client.get(url)
        if resp.status_code == 200:
            return Response(
                content=resp.content,
                media_type=resp.headers.get("content-type", "image/jpeg"),
                headers={"Cache-Control": "public, max-age=3600"},
            )
    except Exception:
        pass
    return Response(status_code=404)


@router.get("/api/share/hls/{token}/{path:path}")
def share_hls(token: str, path: str, request: Request):
    row = share_svc.resolve(token, int(time.time()))
    if not row:
        return Response(status_code=403)

    params = share_svc.hls_upstream_params(row["item_id"], row["id"], dict(request.query_params))
    upstream = f"{share_svc.jellyfin_base()}/Videos/{row['item_id']}/{path}"

    # Playlists: fetch fully, strip any api_key, return as m3u8.
    if path.endswith(".m3u8"):
        try:
            resp = _client.get(upstream, params=params)
        except Exception:
            return Response(status_code=502)
        if resp.status_code != 200:
            return Response(status_code=resp.status_code)
        return Response(
            content=share_svc.scrub_playlist(resp.text),
            media_type="application/vnd.apple.mpegurl",
            headers={"Cache-Control": "no-store"},
        )

    # Segments / other: stream bytes straight through.
    upstream_req = _client.build_request("GET", upstream, params=params)
    resp = _client.send(upstream_req, stream=True)
    if resp.status_code >= 400:
        resp.close()
        return Response(status_code=resp.status_code)
    media_type = resp.headers.get("content-type", "video/mp2t")

    def _iter():
        try:
            yield from resp.iter_bytes()
        finally:
            resp.close()

    return StreamingResponse(_iter(), media_type=media_type, headers={"Cache-Control": "no-store"})


# --- HTML ---


def _player_html(title: str, hls_url: str, poster_url: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<link rel="preload" as="image" href="{poster_url}">
<style>
  :root {{ color-scheme: dark; }}
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; height: 100%; background: #07090c; color: #e8edf2;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
  .wrap {{ min-height: 100%; display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 16px; gap: 16px; }}
  .title {{ font-size: 1.1rem; font-weight: 600; letter-spacing: .01em; text-align: center;
    opacity: .92; }}
  .stage {{ width: 100%; max-width: 1100px; aspect-ratio: 16/9; background: #000;
    border-radius: 14px; overflow: hidden; box-shadow: 0 18px 60px rgba(0,0,0,.6);
    position: relative; }}
  video {{ width: 100%; height: 100%; display: block; background: #000 center/cover no-repeat; }}
  .hint {{ font-size: .8rem; opacity: .5; }}
  .err {{ max-width: 420px; text-align: center; font-size: .95rem; opacity: .8; line-height: 1.6; }}
</style>
</head>
<body>
  <div class="wrap">
    <div class="title">{title}</div>
    <div class="stage">
      <video id="v" controls playsinline preload="metadata" poster="{poster_url}"></video>
    </div>
    <div class="hint" id="hint">Shared privately · tap play to start</div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
  <script>
    var v = document.getElementById('v');
    var hint = document.getElementById('hint');
    var src = "{hls_url}";
    function fail(msg) {{ hint.textContent = msg || 'Could not load this video.'; }}
    if (window.Hls && window.Hls.isSupported()) {{
      var hls = new Hls({{ maxBufferLength: 30 }});
      hls.loadSource(src);
      hls.attachMedia(v);
      hls.on(Hls.Events.ERROR, function (e, d) {{ if (d && d.fatal) fail('Playback error — the link may have expired.'); }});
    }} else if (v.canPlayType('application/vnd.apple.mpegurl')) {{
      v.src = src; // Safari / iOS native HLS
      v.addEventListener('error', function () {{ fail('Playback error — the link may have expired.'); }});
    }} else {{
      fail('This browser cannot play the stream. Try Chrome, Safari, or Edge.');
    }}
  </script>
</body>
</html>"""


def _expired_html() -> str:
    return """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Link unavailable</title>
<style>
  html,body{margin:0;height:100%;background:#07090c;color:#e8edf2;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;}
  .box{max-width:420px;line-height:1.6;opacity:.85}
  h1{font-size:1.2rem;margin:0 0 8px}
  p{font-size:.95rem;opacity:.7;margin:0}
</style></head>
<body><div class="box"><h1>This link is no longer available</h1>
<p>It may have expired or been turned off. Ask the person who shared it for a fresh link.</p>
</div></body></html>"""
