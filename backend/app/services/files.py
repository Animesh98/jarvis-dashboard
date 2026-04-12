import os
import shutil
import stat as stat_module

from app.config import settings


def _get_home() -> str:
    return settings.file_home or os.path.expanduser("~")


def _resolve_path(requested: str) -> str:
    home = _get_home()
    requested = requested.strip()
    if not requested or requested == "~":
        return os.path.realpath(home)
    if requested.startswith("~"):
        requested = os.path.join(home, requested[1:].lstrip("/"))
    if not os.path.isabs(requested):
        requested = os.path.join(home, requested)
    return os.path.realpath(requested)


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


def mkdir(rel_path: str) -> dict:
    full = _resolve_path(rel_path)
    try:
        os.makedirs(full, exist_ok=True)
        return {"ok": True, "message": f"Created {os.path.basename(full)}"}
    except Exception as e:
        return {"error": str(e)}


def rename(rel_path: str, new_name: str) -> dict:
    full = _resolve_path(rel_path)
    if not os.path.exists(full):
        return {"error": "Not found"}
    if "/" in new_name or "\\" in new_name:
        return {"error": "Invalid name"}
    new_full = os.path.join(os.path.dirname(full), new_name)
    try:
        os.rename(full, new_full)
        return {"ok": True, "message": f"Renamed to {new_name}"}
    except Exception as e:
        return {"error": str(e)}


def download_path(rel_path: str) -> str | None:
    full = _resolve_path(rel_path)
    if not os.path.isfile(full):
        return None
    return full
