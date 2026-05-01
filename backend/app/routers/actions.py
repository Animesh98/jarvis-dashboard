import subprocess

from fastapi import APIRouter

from app.config import settings
from app.services import docker as docker_svc
from app.services import jellyfin as jellyfin_svc
from app.services import qbittorrent as qbit_svc
from app.services import transmission as trans_svc

router = APIRouter(prefix="/api/actions", tags=["actions"])


def _torrent_svc():
    return trans_svc if settings.torrent_client == "transmission" else qbit_svc


@router.post("/jellyfin-scan")
def jellyfin_scan():
    return jellyfin_svc.scan_library()


@router.post("/clean-torrents")
def clean_torrents():
    return _torrent_svc().clean_completed()


@router.post("/docker-prune")
def docker_prune():
    return docker_svc.prune()


@router.post("/update-check")
def update_check():
    try:
        subprocess.run(["apt", "update", "-qq"], capture_output=True, timeout=30)
        r = subprocess.run(["apt", "list", "--upgradable"], capture_output=True, text=True, timeout=15)
        lines = [line for line in r.stdout.strip().split("\n") if "/" in line]
        if lines:
            return {"ok": True, "message": f"{len(lines)} packages upgradable", "packages": lines[:20]}
        return {"ok": True, "message": "System is up to date"}
    except Exception as e:
        return {"error": str(e)}
