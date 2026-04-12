"""Kanban task manager — JSON file-backed storage with date-based views."""

import json
import logging
import os
import tempfile
import time
import uuid
from datetime import date
from pathlib import Path
from threading import Lock

logger = logging.getLogger(__name__)

DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parents[2]))
TASKS_FILE = DATA_DIR / "tasks.json"

_lock = Lock()


def _read() -> list[dict]:
    if not TASKS_FILE.exists():
        return []
    try:
        with open(TASKS_FILE) as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        logger.exception("Failed to read %s", TASKS_FILE)
        return []


def _write(tasks: list[dict]):
    fd, tmp = tempfile.mkstemp(dir=DATA_DIR, suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(tasks, f, indent=2)
        os.replace(tmp, TASKS_FILE)
    except Exception:
        logger.exception("Failed to write %s", TASKS_FILE)
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _ensure_date(task: dict) -> dict:
    """Backfill date field from created_at if missing."""
    if "date" not in task or not task["date"]:
        try:
            task["date"] = task["created_at"][:10]
        except (KeyError, TypeError):
            task["date"] = date.today().isoformat()
    return task


def list_tasks(for_date: str | None = None) -> list[dict]:
    with _lock:
        tasks = _read()
        tasks = [_ensure_date(t) for t in tasks]
    if for_date:
        tasks = [t for t in tasks if t["date"] == for_date]
    return tasks


def create_task(title: str, column: str = "todo", entities: list | None = None, task_date: str | None = None) -> dict:
    task = {
        "id": uuid.uuid4().hex[:12],
        "title": title,
        "column": column,
        "order": int(time.time() * 1000),
        "entities": entities or [],
        "date": task_date or date.today().isoformat(),
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    with _lock:
        tasks = _read()
        tasks.append(task)
        _write(tasks)
    return task


def update_task(task_id: str, updates: dict) -> dict | None:
    allowed = {"title", "column", "order", "entities", "date"}
    with _lock:
        tasks = _read()
        for t in tasks:
            if t["id"] == task_id:
                for k, v in updates.items():
                    if k in allowed:
                        t[k] = v
                _write(tasks)
                return t
    return None


def delete_task(task_id: str) -> bool:
    with _lock:
        tasks = _read()
        new_tasks = [t for t in tasks if t["id"] != task_id]
        if len(new_tasks) == len(tasks):
            return False
        _write(new_tasks)
    return True


def reorder(task_orders: list[dict]) -> bool:
    """Batch update order and column for multiple tasks. Each item: {id, column, order}."""
    with _lock:
        tasks = _read()
        lookup = {t["id"]: t for t in tasks}
        updated = 0
        for item in task_orders:
            tid = item.get("id")
            if tid in lookup:
                if "column" in item:
                    lookup[tid]["column"] = item["column"]
                if "order" in item:
                    lookup[tid]["order"] = item["order"]
                updated += 1
        if updated > 0:
            _write(tasks)
        else:
            logger.warning("Reorder called but no tasks matched: %s", [i.get("id") for i in task_orders])
    return updated > 0


def migrate_previous_todos(target_date: str | None = None) -> list[dict]:
    """Move all non-done tasks from dates before target_date to target_date.

    Returns the list of migrated tasks.
    """
    target = target_date or date.today().isoformat()
    migrated: list[dict] = []
    with _lock:
        tasks = _read()
        tasks = [_ensure_date(t) for t in tasks]
        for t in tasks:
            if t["date"] < target and t["column"] != "done":
                t["date"] = target
                migrated.append(t)
        if migrated:
            _write(tasks)
    return migrated
