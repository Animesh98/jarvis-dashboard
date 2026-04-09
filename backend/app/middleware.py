"""
Auth middleware — protects direct backend access.

How it works:
  1. Requests from localhost (127.0.0.1, ::1) are TRUSTED — these come
     from the Next.js proxy on the same machine. No key needed.
  2. Requests from any other IP must include a valid X-API-Key header.
  3. If no API_KEY is set in .env, auth is disabled (open access, like before).

This is a FastAPI middleware (ASGI), meaning it runs BEFORE any router.
Every single request passes through here first.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import settings

# IPs that are considered "local" — the Next.js proxy runs on the same machine
_TRUSTED_HOSTS = {"127.0.0.1", "::1", "localhost"}


class APIKeyMiddleware(BaseHTTPMiddleware):
    """
    ASGI middleware that checks X-API-Key header for non-local requests.

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

        # Allow docs/openapi pages through (useful for debugging)
        if request.url.path in ("/docs", "/openapi.json", "/redoc"):
            return await call_next(request)

        # Trust requests from localhost (Next.js proxy)
        client_ip = request.client.host if request.client else None
        if client_ip in _TRUSTED_HOSTS:
            return await call_next(request)

        # Non-local request — require API key
        provided_key = request.headers.get("x-api-key", "")
        if provided_key != settings.api_key:
            return JSONResponse(
                status_code=401,
                content={"error": "Invalid or missing API key"},
            )

        return await call_next(request)
