import json
import re
import subprocess

SAFE_CONTAINER_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.\-]+$")
ALLOWED_ACTIONS = {"start", "stop", "restart"}


def get_containers() -> dict | list:
    try:
        r = subprocess.run(["docker", "ps", "-a", "--format", "{{json .}}"], capture_output=True, text=True, timeout=10)
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
            ["docker", "stats", "--no-stream", "--format", "{{json .}}"], capture_output=True, text=True, timeout=15
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
        r = subprocess.run(["docker", action_name, container], capture_output=True, text=True, timeout=30)
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


def prune() -> dict:
    try:
        r = subprocess.run(["docker", "system", "prune", "-f"], capture_output=True, text=True, timeout=30)
        if r.returncode != 0:
            return {"error": r.stderr.strip()}
        return {"ok": True, "message": r.stdout.strip()[:200]}
    except Exception as e:
        return {"error": str(e)}
