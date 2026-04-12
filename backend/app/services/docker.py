import asyncio
import json
import re
import subprocess

from fastapi import WebSocket, WebSocketDisconnect
from ptyprocess import PtyProcess

SAFE_CONTAINER_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.\-]+$")
ALLOWED_ACTIONS = {"start", "stop", "restart"}


def get_containers() -> dict | list:
    try:
        r = subprocess.run(
            ["docker", "ps", "-a", "--format", "{{json .}}"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if r.returncode != 0:
            return {"error": f"docker ps failed: {r.stderr.strip()}"}
        return [json.loads(line) for line in r.stdout.strip().split("\n") if line.strip()]
    except subprocess.TimeoutExpired:
        return {"error": "docker ps timed out"}
    except Exception as e:
        return {"error": str(e)}


def get_stats() -> dict | list:
    try:
        r = subprocess.run(
            ["docker", "stats", "--no-stream", "--format", "{{json .}}"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if r.returncode != 0:
            return {"error": f"docker stats failed: {r.stderr.strip()}"}
        return [json.loads(line) for line in r.stdout.strip().split("\n") if line.strip()]
    except subprocess.TimeoutExpired:
        return {"error": "docker stats timed out"}
    except Exception as e:
        return {"error": str(e)}


def action(container: str, action_name: str) -> dict:
    if action_name not in ALLOWED_ACTIONS:
        return {"error": f"Invalid action: {action_name}"}
    if not SAFE_CONTAINER_RE.match(container):
        return {"error": f"Invalid container name: {container}"}
    try:
        r = subprocess.run(
            ["docker", action_name, container],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if r.returncode != 0:
            return {"error": r.stderr.strip() or f"docker {action_name} failed"}
        return {"ok": True, "message": f"{container}: {action_name} successful"}
    except subprocess.TimeoutExpired:
        return {"error": f"docker {action_name} timed out"}
    except Exception as e:
        return {"error": str(e)}


def get_logs(container: str, lines: int = 100) -> dict:
    if not SAFE_CONTAINER_RE.match(container):
        return {"error": "Invalid container name"}
    lines = max(1, min(lines, 500))
    try:
        r = subprocess.run(
            ["docker", "logs", "--tail", str(lines), "--timestamps", container],
            capture_output=True,
            text=True,
            timeout=10,
        )
        combined = r.stdout + r.stderr
        return {"container": container, "logs": combined}
    except subprocess.TimeoutExpired:
        return {"error": "docker logs timed out"}
    except Exception as e:
        return {"error": str(e)}


def get_images() -> dict | list:
    try:
        r = subprocess.run(
            ["docker", "images", "--format", "{{json .}}"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if r.returncode != 0:
            return {"error": f"docker images failed: {r.stderr.strip()}"}
        return [json.loads(line) for line in r.stdout.strip().split("\n") if line.strip()]
    except subprocess.TimeoutExpired:
        return {"error": "docker images timed out"}
    except Exception as e:
        return {"error": str(e)}


def prune() -> dict:
    try:
        r = subprocess.run(
            ["docker", "system", "prune", "-f"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if r.returncode != 0:
            return {"error": r.stderr.strip()}
        return {"ok": True, "message": r.stdout.strip()[:200]}
    except Exception as e:
        return {"error": str(e)}


async def start_terminal(websocket: WebSocket, container: str):
    if not SAFE_CONTAINER_RE.match(container):
        await websocket.close(code=4000)
        return

    await websocket.accept()

    # Try bash, fallback to sh
    cmd = [
        "docker",
        "exec",
        "-it",
        container,
        "sh",
        "-c",
        "if [ -x /bin/bash ]; then exec /bin/bash; else exec /bin/sh; fi",
    ]

    try:
        p = PtyProcess.spawn(cmd, dimensions=(24, 80))

        async def read_from_pty():
            try:
                while p.isalive():
                    data = await asyncio.to_thread(p.read, 1024)
                    if data:
                        await websocket.send_text(data.decode("utf-8", errors="ignore"))
            except Exception:
                pass

        async def write_to_pty():
            try:
                while p.isalive():
                    data = await websocket.receive_text()
                    p.write(data.encode())
            except (WebSocketDisconnect, Exception):
                pass

        # Run both tasks and wait for one to finish
        read_task = asyncio.create_task(read_from_pty())
        write_task = asyncio.create_task(write_to_pty())

        await asyncio.wait([read_task, write_task], return_when=asyncio.FIRST_COMPLETED)
        read_task.cancel()
        write_task.cancel()

    except Exception as e:
        print(f"Terminal error: {e}")
    finally:
        if "p" in locals() and p.isalive():
            p.terminate(force=True)
        try:
            await websocket.close()
        except Exception:
            pass
