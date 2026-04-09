from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.config import settings
from app.services import qbittorrent as qbit_svc
from app.services import transmission as trans_svc

router = APIRouter(prefix="/api", tags=["torrents"])


def _svc():
    """Return the active torrent client service module."""
    return trans_svc if settings.torrent_client == "transmission" else qbit_svc


class TorrentAddRequest(BaseModel):
    magnet: str
    category: str = ""


class TorrentActionRequest(BaseModel):
    hashes: list[str]


class TorrentDeleteRequest(BaseModel):
    hashes: list[str]
    delete_files: bool = False


@router.get("/torrent-search")
def search(q: str = ""):
    # Search is provider-agnostic — it queries apibay.org, not the active
    # torrent client. The implementation just happens to live in qbit_svc
    # for historical reasons; it works identically for Transmission users.
    if not q:
        return {"error": "Missing query"}
    return qbit_svc.search_torrents(q)


@router.post("/torrent-add")
def add_torrent(body: TorrentAddRequest):
    return _svc().add_torrent(body.magnet, body.category)


@router.get("/torrents/list")
def list_torrents():
    return _svc().get_torrents()


@router.get("/torrents/transfer")
def transfer_info():
    return _svc().get_transfer_info()


@router.post("/torrents/pause")
def pause_torrent(body: TorrentActionRequest):
    return _svc().pause_torrent(body.hashes)


@router.post("/torrents/resume")
def resume_torrent(body: TorrentActionRequest):
    return _svc().resume_torrent(body.hashes)


@router.post("/torrents/delete")
def delete_torrent(body: TorrentDeleteRequest):
    return _svc().delete_torrent(body.hashes, body.delete_files)


@router.api_route("/qbit/{path:path}", methods=["GET", "POST"])
async def qbit_proxy(path: str, request: Request):
    """Legacy qBittorrent proxy — kept for backward compatibility."""
    qbit_path = f"/{path}"
    query = str(request.query_params)
    if query:
        qbit_path += f"?{query}"
    if request.method == "POST":
        body = (await request.body()).decode()
        return qbit_svc.request(qbit_path, method="POST", body=body)
    return qbit_svc.request(qbit_path)
