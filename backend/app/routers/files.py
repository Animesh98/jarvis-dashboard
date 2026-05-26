import mimetypes
import os

from fastapi import APIRouter
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.services import files as files_svc

router = APIRouter(prefix="/api/files", tags=["files"])


class PathRequest(BaseModel):
    path: str


class MoveRequest(BaseModel):
    src: str
    dst: str


class RenameRequest(BaseModel):
    path: str
    name: str


@router.get("/list")
def list_dir(path: str = ""):
    return files_svc.list_dir(path)


@router.get("/read")
def read(path: str = ""):
    return files_svc.read_text(path)


@router.get("/download")
def download(path: str = ""):
    real = files_svc.download_path(path)
    if not real:
        return {"error": "File not found or is a directory"}
    filename = os.path.basename(real)
    mime, _ = mimetypes.guess_type(real)
    return FileResponse(real, media_type=mime or "application/octet-stream", filename=filename)


@router.post("/delete")
def delete(body: PathRequest):
    return files_svc.delete(body.path)


@router.post("/move")
def move(body: MoveRequest):
    return files_svc.move(body.src, body.dst)


@router.post("/copy")
def copy(body: MoveRequest):
    return files_svc.copy(body.src, body.dst)


@router.post("/mkdir")
def mkdir(body: PathRequest):
    return files_svc.mkdir(body.path)


@router.post("/rename")
def rename_file(body: RenameRequest):
    return files_svc.rename(body.path, body.name)
