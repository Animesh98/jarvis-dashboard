"""SQLite database service for persistent user data (watchlist, ratings, etc.)."""

import os
import sqlite3
import threading
from pathlib import Path

_DATA_DIR = Path(os.environ.get("DATA_DIR", str(Path(__file__).parent.parent.parent)))
_DB_PATH = _DATA_DIR / "jarvis.db"
_lock = threading.Lock()


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Create tables if they don't exist."""
    with _lock:
        conn = _get_conn()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS watchlist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tmdb_id TEXT NOT NULL,
                media_type TEXT NOT NULL DEFAULT 'movie',
                title TEXT NOT NULL,
                year TEXT DEFAULT '',
                poster TEXT DEFAULT '',
                category TEXT NOT NULL DEFAULT 'Must Watch',
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tmdb_id, media_type)
            );
            CREATE TABLE IF NOT EXISTS shares (
                id TEXT PRIMARY KEY,
                item_id TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                poster_tag TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at INTEGER NOT NULL,
                revoked INTEGER NOT NULL DEFAULT 0
            );
        """)
        conn.commit()
        conn.close()


# --- Watchlist operations ---


def watchlist_add(
    tmdb_id: str, media_type: str, title: str, year: str = "", poster: str = "", category: str = "Must Watch"
) -> dict:
    with _lock:
        conn = _get_conn()
        try:
            conn.execute(
                """INSERT INTO watchlist (tmdb_id, media_type, title, year, poster, category)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(tmdb_id, media_type) DO UPDATE SET category=excluded.category""",
                (tmdb_id, media_type, title, year, poster, category),
            )
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()


def watchlist_remove(tmdb_id: str, media_type: str) -> dict:
    with _lock:
        conn = _get_conn()
        try:
            conn.execute(
                "DELETE FROM watchlist WHERE tmdb_id=? AND media_type=?",
                (tmdb_id, media_type),
            )
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()


def watchlist_list(category: str = "") -> list[dict]:
    with _lock:
        conn = _get_conn()
        try:
            if category:
                rows = conn.execute(
                    "SELECT * FROM watchlist WHERE category=? ORDER BY added_at DESC",
                    (category,),
                ).fetchall()
            else:
                rows = conn.execute("SELECT * FROM watchlist ORDER BY added_at DESC").fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()


def watchlist_check(tmdb_id: str, media_type: str) -> dict | None:
    """Check if a title is in the watchlist. Returns row dict or None."""
    with _lock:
        conn = _get_conn()
        try:
            row = conn.execute(
                "SELECT * FROM watchlist WHERE tmdb_id=? AND media_type=?",
                (tmdb_id, media_type),
            ).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()


def watchlist_update_category(tmdb_id: str, media_type: str, category: str) -> dict:
    with _lock:
        conn = _get_conn()
        try:
            conn.execute(
                "UPDATE watchlist SET category=? WHERE tmdb_id=? AND media_type=?",
                (category, tmdb_id, media_type),
            )
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()


# --- Share operations (public movie links served via Tailscale Funnel) ---


def share_create(id: str, item_id: str, title: str, poster_tag: str, expires_at: int) -> None:
    with _lock:
        conn = _get_conn()
        try:
            conn.execute(
                """INSERT INTO shares (id, item_id, title, poster_tag, expires_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (id, item_id, title, poster_tag, expires_at),
            )
            conn.commit()
        finally:
            conn.close()


def share_get(id: str) -> dict | None:
    """Return a share row only if it exists and is not revoked. Caller checks expiry."""
    with _lock:
        conn = _get_conn()
        try:
            row = conn.execute(
                "SELECT * FROM shares WHERE id=? AND revoked=0",
                (id,),
            ).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()


def share_list() -> list[dict]:
    """All non-revoked shares, newest first."""
    with _lock:
        conn = _get_conn()
        try:
            rows = conn.execute("SELECT * FROM shares WHERE revoked=0 ORDER BY created_at DESC").fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()


def share_revoke(id: str) -> dict:
    with _lock:
        conn = _get_conn()
        try:
            conn.execute("UPDATE shares SET revoked=1 WHERE id=?", (id,))
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()
