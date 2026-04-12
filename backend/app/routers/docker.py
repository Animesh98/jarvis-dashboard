from fastapi import APIRouter, WebSocket
from pydantic import BaseModel

from app.services import docker as docker_svc

router = APIRouter(prefix="/api/docker", tags=["docker"])


class DockerActionRequest(BaseModel):
    container: str
    action: str


@router.get("/containers")
def get_containers():
    return docker_svc.get_containers()


@router.get("/images")
def get_images():
    return docker_svc.get_images()


@router.get("/stats")
def get_stats():
    return docker_svc.get_stats()


@router.get("/logs")
def get_logs(container: str = "", lines: int = 100):
    return docker_svc.get_logs(container, lines)


@router.post("/action")
def do_action(body: DockerActionRequest):
    return docker_svc.action(body.container, body.action)


@router.websocket("/terminal/{container}")
async def terminal_endpoint(websocket: WebSocket, container: str):
    await docker_svc.start_terminal(websocket, container)
