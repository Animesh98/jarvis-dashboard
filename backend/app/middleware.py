"""
Auth middleware — protects the API with a shared key.

How it works:
  1. If no API_KEY is set in .env, auth is disabled (open access, like before).
  2. Every request must carry the key in an X-API-Key header. The browser
     stores it in localStorage and lib/api.ts attaches it to each fetch.
     Requests that can't send headers (window.open downloads) may pass it
     as a ?key= query parameter on GET requests instead.
  3. A small allowlist stays public: docs pages, the feature-flag config the
     frontend needs before it knows the key, and the read-only image proxies
     (loaded via <img> tags, which can't send headers).

Localhost is deliberately NOT trusted: the Next.js proxy forwards every
browser request from 127.0.0.1, so trusting localhost would mean anyone who
can reach port 3000 gets full unauthenticated access.

This is a FastAPI middleware (ASGI), meaning it runs BEFORE any router.
Every single request passes through here first.
"""

import secrets

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import settings

# Exact paths that never require the key
_PUBLIC_PATHS = {
    "/docs",
    "/openapi.json",
    "/redoc",
    "/api/config/features",
    # Password → API key exchange; does its own auth (see routers/auth.py)
    "/api/auth/unlock",
}

# Prefixes that never require the key — read-only image proxies consumed
# by <img src=...>, which cannot attach headers, plus the public movie-share
# surface (each route is independently token-gated in routers/share.py and
# reachable from the internet via Tailscale Funnel). NOTE: the share *create*,
# *list* and *revoke* endpoints are NOT here, so they still require the key.
_PUBLIC_PREFIXES = (
    "/api/tmdb-image/",
    "/api/jellyfin-media/poster",
    "/w/",
    "/api/share/hls/",
    "/api/share/poster/",
)


class APIKeyMiddleware(BaseHTTPMiddleware):
    """
    ASGI middleware that checks X-API-Key on every request.

    Why middleware instead of a FastAPI dependency?
    - Middleware runs on EVERY request automatically — no risk of forgetting
      to add a dependency to a new router.
    - A dependency (Depends(verify_key)) must be added to each router manually.
      If you forget one, that endpoint is unprotected. Middleware is safer.
    """

    async def dispatch(self, request: Request, call_next):
        # If no API key configured, skip auth entirely (backwards compatible)
        if not settings.api_key:
            return await call_next(request)

        path = request.url.path
        if path in _PUBLIC_PATHS or path.startswith(_PUBLIC_PREFIXES):
            return await call_next(request)

        provided_key = request.headers.get("x-api-key", "")
        if not provided_key and request.method == "GET":
            # window.open / <a download> can't send headers
            provided_key = request.query_params.get("key", "")

        if not secrets.compare_digest(provided_key, settings.api_key):
            return JSONResponse(
                status_code=401,
                content={"error": "Invalid or missing API key"},
            )

        return await call_next(request)
