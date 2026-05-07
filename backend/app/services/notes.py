"""Notes — JSON file-backed storage with tags, pinning, and search."""

import json
import logging
import os
import tempfile
import time
import uuid
from pathlib import Path
from threading import Lock

logger = logging.getLogger(__name__)

DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parents[2]))
NOTES_FILE = DATA_DIR / "notes.json"

_lock = Lock()


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _read() -> list[dict]:
    if not NOTES_FILE.exists():
        return []
    try:
        with open(NOTES_FILE) as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        logger.exception("Failed to read %s", NOTES_FILE)
        return []


def _write(notes: list[dict]):
    fd, tmp = tempfile.mkstemp(dir=DATA_DIR, suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(notes, f, indent=2)
        os.replace(tmp, NOTES_FILE)
    except Exception:
        logger.exception("Failed to write %s", NOTES_FILE)
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _matches_search(note: dict, q: str) -> bool:
    if not q:
        return True
    q = q.lower()
    return q in (note.get("title", "") or "").lower() or q in (note.get("content", "") or "").lower()


def list_notes(q: str | None = None, tag: str | None = None) -> list[dict]:
    with _lock:
        notes = _read()
    if tag:
        notes = [n for n in notes if tag in (n.get("tags") or [])]
    if q:
        notes = [n for n in notes if _matches_search(n, q)]
    # Pinned first, then by updated_at desc
    notes.sort(key=lambda n: (not n.get("pinned", False), -_iso_to_ts(n.get("updated_at", ""))))
    return notes


def _iso_to_ts(s: str) -> float:
    if not s:
        return 0.0
    try:
        return time.mktime(time.strptime(s, "%Y-%m-%dT%H:%M:%SZ"))
    except Exception:
        return 0.0


def get_note(note_id: str) -> dict | None:
    with _lock:
        for n in _read():
            if n["id"] == note_id:
                return n
    return None


def create_note(title: str, content: str = "", tags: list[str] | None = None, pinned: bool = False) -> dict:
    note = {
        "id": uuid.uuid4().hex[:12],
        "title": title or "Untitled",
        "content": content or "",
        "tags": tags or [],
        "pinned": bool(pinned),
        "created_at": _now(),
        "updated_at": _now(),
    }
    with _lock:
        notes = _read()
        notes.append(note)
        _write(notes)
    return note


def update_note(note_id: str, updates: dict) -> dict | None:
    allowed = {"title", "content", "tags", "pinned"}
    with _lock:
        notes = _read()
        for n in notes:
            if n["id"] == note_id:
                for k, v in updates.items():
                    if k in allowed:
                        n[k] = v
                n["updated_at"] = _now()
                _write(notes)
                return n
    return None


def delete_note(note_id: str) -> bool:
    with _lock:
        notes = _read()
        new_notes = [n for n in notes if n["id"] != note_id]
        if len(new_notes) == len(notes):
            return False
        _write(new_notes)
    return True


def all_tags() -> list[str]:
    with _lock:
        notes = _read()
    counts: dict[str, int] = {}
    for n in notes:
        for t in n.get("tags") or []:
            counts[t] = counts.get(t, 0) + 1
    return sorted(counts.keys(), key=lambda t: (-counts[t], t.lower()))
