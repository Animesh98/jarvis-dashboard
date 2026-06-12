import functools
import os
import shutil
import stat as stat_module

from app.config import settings


class PathDeniedError(Exception):
    """Raised when a requested path escapes the allowed roots."""


def _get_home() -> str:
    return settings.file_home or os.path.expanduser("~")


def _allowed_roots() -> list[str]:
    roots = [os.path.realpath(_get_home())]
    if settings.media_path and os.path.isdir(settings.media_path):
        roots.append(os.path.realpath(settings.media_path))
    return roots


def _resolve_path(requested: str) -> str:
    home = _get_home()
    requested = requested.strip()
    if not requested or requested == "~":
        return os.path.realpath(home)
    if requested.startswith("~"):
        requested = os.path.join(home, requested[1:].lstrip("/"))
    if not os.path.isabs(requested):
        requested = os.path.join(home, requested)
    full = os.path.realpath(requested)
    # Jail: realpath (symlinks/.. resolved) must live under an allowed root
    for root in _allowed_roots():
        if full == root or full.startswith(root + os.sep):
            return full
    raise PathDeniedError("Access denied: path outside allowed directories")


def _deny_to_error(fn):
    """Convert PathDeniedError into the {"error": ...} shape the routers return."""

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except PathDeniedError as e:
            return {"error": str(e)}

    return wrapper


@_deny_to_error
def list_dir(rel_path: str) -> dict:
    full = _resolve_path(rel_path)
    if not os.path.exists(full):
        return {"error": "Path not found"}
    if not os.path.isdir(full):
        return {"error": "Not a directory"}
    items = []
    try:
        for name in sorted(os.listdir(full), key=lambda n: (not os.path.isdir(os.path.join(full, n)), n.lower())):
            fp = os.path.join(full, name)
            try:
                st = os.stat(fp)
                items.append(
                    {
                        "name": name,
                        "is_dir": os.path.isdir(fp),
                        "size": st.st_size if not os.path.isdir(fp) else 0,
                        "modified": st.st_mtime,
                        "permissions": stat_module.filemode(st.st_mode),
                    }
                )
            except OSError:
                items.append({"name": name, "is_dir": False, "size": 0, "modified": 0, "permissions": "?"})
    except PermissionError:
        return {"error": "Permission denied"}
    return {"path": full, "items": items, "home": _get_home()}


@_deny_to_error
def delete(rel_path: str) -> dict:
    full = _resolve_path(rel_path)
    if not os.path.exists(full):
        return {"error": "Not found"}
    try:
        if os.path.isdir(full):
            shutil.rmtree(full)
        else:
            os.remove(full)
        return {"ok": True, "message": f"Deleted {os.path.basename(full)}"}
    except Exception as e:
        return {"error": str(e)}


@_deny_to_error
def move(src_rel: str, dst_rel: str) -> dict:
    src = _resolve_path(src_rel)
    dst = _resolve_path(dst_rel)
    if not os.path.exists(src):
        return {"error": "Source not found"}
    try:
        shutil.move(src, dst)
        return {"ok": True, "message": f"Moved to {os.path.basename(dst)}"}
    except Exception as e:
        return {"error": str(e)}


@_deny_to_error
def copy(src_rel: str, dst_rel: str) -> dict:
    src = _resolve_path(src_rel)
    dst = _resolve_path(dst_rel)
    if not os.path.exists(src):
        return {"error": "Source not found"}
    try:
        if os.path.isdir(src):
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)
        return {"ok": True, "message": f"Copied to {os.path.basename(dst)}"}
    except Exception as e:
        return {"error": str(e)}


@_deny_to_error
def mkdir(rel_path: str) -> dict:
    full = _resolve_path(rel_path)
    try:
        os.makedirs(full, exist_ok=True)
        return {"ok": True, "message": f"Created {os.path.basename(full)}"}
    except Exception as e:
        return {"error": str(e)}


@_deny_to_error
def rename(rel_path: str, new_name: str) -> dict:
    full = _resolve_path(rel_path)
    if not os.path.exists(full):
        return {"error": "Not found"}
    if "/" in new_name or "\\" in new_name or new_name in (".", ".."):
        return {"error": "Invalid name"}
    new_full = os.path.join(os.path.dirname(full), new_name)
    try:
        os.rename(full, new_full)
        return {"ok": True, "message": f"Renamed to {new_name}"}
    except Exception as e:
        return {"error": str(e)}


def download_path(rel_path: str) -> str | None:
    try:
        full = _resolve_path(rel_path)
    except PathDeniedError:
        return None
    if not os.path.isfile(full):
        return None
    return full


MAX_VIEW_BYTES = 2 * 1024 * 1024  # 2 MB


@_deny_to_error
def read_text(rel_path: str) -> dict:
    full = _resolve_path(rel_path)
    if not os.path.isfile(full):
        return {"error": "Not a file"}
    try:
        size = os.path.getsize(full)
    except OSError as e:
        return {"error": str(e)}
    if size > MAX_VIEW_BYTES:
        return {"error": f"File too large to view ({size} bytes; max {MAX_VIEW_BYTES})"}
    try:
        with open(full, "rb") as fh:
            raw = fh.read()
    except Exception as e:
        return {"error": str(e)}
    if b"\x00" in raw[:8192]:
        return {"error": "Binary file — cannot preview"}
    for enc in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            content = raw.decode(enc)
            break
        except UnicodeDecodeError:
            content = None
    if content is None:
        return {"error": "Cannot decode file as text"}
    name = os.path.basename(full)
    _, ext = os.path.splitext(name)
    return {"name": name, "ext": ext.lower().lstrip("."), "size": size, "content": content}
