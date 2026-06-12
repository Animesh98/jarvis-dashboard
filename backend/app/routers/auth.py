"""
Unlock endpoint — exchanges the dashboard password for the API key.

The password is something a human can remember and type on a new device;
the API key stays the long random secret every request actually carries
(localStorage + X-API-Key header). This endpoint is on the middleware's
public allowlist, so it is the one place open to guessing — failed
attempts share a global 1-second delay to keep brute force impractical.
"""

import asyncio
import secrets

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Serializes failed attempts: at most one wrong guess per second, globally.
_fail_lock = asyncio.Lock()


class UnlockRequest(BaseModel):
    password: str


@router.post("/unlock")
async def unlock(body: UnlockRequest):
    if not settings.api_key or not settings.dashboard_password:
        return JSONResponse(
            status_code=404,
            content={"error": "Password unlock is not configured"},
        )
    if not secrets.compare_digest(body.password, settings.dashboard_password):
        async with _fail_lock:
            await asyncio.sleep(1.0)
        return JSONResponse(status_code=401, content={"error": "Wrong password"})
    return {"key": settings.api_key}
