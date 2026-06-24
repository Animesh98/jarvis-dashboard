import threading
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import APIRouter, FastAPI
from fastapi.responses import PlainTextResponse, Response

from app.config import settings
from app.middleware import APIKeyMiddleware
from app.routers import (
    actions,
    auth,
    docker,
    files,
    media,
    notes,
    recommendations,
    share,
    streaming,
    system,
    tasks,
    torrents,
    watchlist,
)
from app.services import database as db_svc
from app.services import qbittorrent as qbit_svc
from app.services import system as system_svc
from app.services import transmission as trans_svc

# TMDB image proxy — serves images from image.tmdb.org through the backend
# so mobile clients on Tailscale (which can't resolve TMDB CDN) still get images
_tmdb_img_router = APIRouter(prefix="/api/tmdb-image", tags=["tmdb-image"])
_tmdb_img_client = httpx.Client(timeout=10, follow_redirects=True)


@_tmdb_img_router.get("/{path:path}")
def tmdb_image_proxy(path: str):
    url = f"https://image.tmdb.org/t/p/{path}"
    try:
        resp = _tmdb_img_client.get(url)
        if resp.status_code == 200:
            return Response(
                content=resp.content,
                media_type=resp.headers.get("content-type", "image/jpeg"),
                headers={"Cache-Control": "public, max-age=604800"},  # 7 days
            )
    except Exception:
        pass
    return Response(status_code=404)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Init database
    db_svc.init_db()
    # Start bandwidth collector (polls torrent client every 5s) — only if both
    # system and torrent features are enabled. Otherwise the collector would
    # spam failed auth calls for nothing.
    if settings.feature_enabled("system") and settings.feature_enabled("torrents"):
        if settings.torrent_client == "transmission":
            system_svc.start_bandwidth_collector(lambda _path: trans_svc.get_transfer_info())
        else:
            system_svc.start_bandwidth_collector(qbit_svc.request)
    # Prefetch storage cache
    threading.Thread(target=system_svc.get_storage, daemon=True).start()
    print(f"Jarvis Dashboard running on http://{settings.host}:{settings.port}")
    yield


app = FastAPI(
    title="Jarvis Dashboard",
    version="2.0.0",
    docs_url="/docs",
    lifespan=lifespan,
)

# Auth middleware — runs before every request
# See middleware.py for how localhost vs external is handled
app.add_middleware(APIKeyMiddleware)

# Feature flags — optional modules the user can disable during setup.
# Discover / actions / watchlist / streaming / tmdb-image are always on
# because they back the primary movie-discovery flow.
_features = settings.feature_set()

if settings.feature_enabled("system"):
    app.include_router(system.router)
if settings.feature_enabled("docker"):
    app.include_router(docker.router)
if settings.feature_enabled("torrents"):
    app.include_router(torrents.router)
if settings.feature_enabled("media"):
    app.include_router(media.router)
app.include_router(recommendations.router)
if settings.feature_enabled("files"):
    app.include_router(files.router)
app.include_router(actions.router)
app.include_router(streaming.router)
if settings.feature_enabled("tasks"):
    app.include_router(tasks.router)
if settings.feature_enabled("notes"):
    app.include_router(notes.router)
app.include_router(watchlist.router)
if settings.feature_enabled("media"):
    app.include_router(share.router)
app.include_router(auth.router)
app.include_router(_tmdb_img_router)


@app.get("/api/config/features")
def get_enabled_features():
    """Lightweight endpoint so the frontend can hide disabled nav tabs."""
    return {"features": sorted(_features)}


@app.get("/docs/report")
def serve_audit_report():
    """Serve the dashboard audit report as rendered HTML."""
    report_path = Path(__file__).parent.parent.parent / "docs" / "dashboard-audit-report.md"
    if not report_path.exists():
        return PlainTextResponse("Report not found", status_code=404)
    import markdown

    md_text = report_path.read_text()
    html_body = markdown.markdown(md_text, extensions=["tables", "fenced_code", "toc"])
    html = f"""<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Jarvis Dashboard — Audit Report</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; background: #0d1117; color: #c9d1d9; line-height: 1.7; }}
  h1 {{ color: #58a6ff; border-bottom: 1px solid #30363d; padding-bottom: 0.5rem; }}
  h2 {{ color: #79c0ff; margin-top: 2.5rem; border-bottom: 1px solid #21262d; padding-bottom: 0.3rem; }}
  h3 {{ color: #d2a8ff; }}
  table {{ border-collapse: collapse; width: 100%; margin: 1rem 0; }}
  th, td {{ border: 1px solid #30363d; padding: 8px 12px; text-align: left; font-size: 0.9rem; }}
  th {{ background: #161b22; color: #58a6ff; font-weight: 600; }}
  tr:nth-child(even) {{ background: #161b22; }}
  code {{ background: #161b22; padding: 2px 6px; border-radius: 4px; font-size: 0.85em; color: #f0883e; }}
  pre {{ background: #161b22; padding: 1rem; border-radius: 8px; overflow-x: auto; border: 1px solid #30363d; }}
  pre code {{ background: none; color: #c9d1d9; padding: 0; }}
  a {{ color: #58a6ff; }}
  blockquote {{ border-left: 3px solid #30363d; padding-left: 1rem; color: #8b949e; }}
  strong {{ color: #f0f6fc; }}
  hr {{ border: none; border-top: 1px solid #21262d; margin: 2rem 0; }}
</style>
</head><body>{html_body}</body></html>"""
    from fastapi.responses import HTMLResponse

    return HTMLResponse(html)
