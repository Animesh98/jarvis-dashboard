import os
import shutil
import subprocess
import threading
import time
from pathlib import Path

import httpx

from app.config import settings

# Storage cache
_storage_cache: dict = {"data": None, "ts": 0}
_storage_lock = threading.Lock()
_STORAGE_TTL = 300

# Weather cache
_weather_cache: dict = {"data": None, "ts": 0}
_WEATHER_TTL = 900

# Bandwidth history (collected by background thread)
bw_history: list = []
_bw_lock = threading.Lock()
_BW_MAX = 360


def get_system_stats() -> dict:
    result = {}
    try:
        with open("/proc/loadavg") as f:
            parts = f.read().split()
            result["cpu_load"] = [float(parts[0]), float(parts[1]), float(parts[2])]
        result["cpu_count"] = os.cpu_count() or 1
    except Exception:
        result["cpu_load"] = [0, 0, 0]
        result["cpu_count"] = 1
    try:
        info = {}
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith(("MemTotal:", "MemAvailable:")):
                    key, val = line.split(":")
                    info[key.strip()] = int(val.strip().split()[0])
        total = info.get("MemTotal", 1)
        avail = info.get("MemAvailable", 0)
        result["memory"] = {
            "total_kb": total,
            "available_kb": avail,
            "used_percent": round((total - avail) / total * 100, 1),
        }
    except Exception:
        result["memory"] = {"total_kb": 0, "available_kb": 0, "used_percent": 0}
    try:
        usage = shutil.disk_usage("/")
        result["disk"] = {
            "total_gb": round(usage.total / 1073741824, 1),
            "used_gb": round(usage.used / 1073741824, 1),
            "free_gb": round(usage.free / 1073741824, 1),
            "used_percent": round(usage.used / usage.total * 100, 1),
        }
    except Exception:
        result["disk"] = {"total_gb": 0, "used_gb": 0, "free_gb": 0, "used_percent": 0}
    try:
        with open("/proc/uptime") as f:
            secs = int(float(f.read().split()[0]))
            days, rem = divmod(secs, 86400)
            hours, rem = divmod(rem, 3600)
            mins = rem // 60
            parts = []
            if days:
                parts.append(f"{days}d")
            if hours:
                parts.append(f"{hours}h")
            parts.append(f"{mins}m")
            result["uptime_seconds"] = secs
            result["uptime_human"] = " ".join(parts)
    except Exception:
        result["uptime_seconds"] = 0
        result["uptime_human"] = "unknown"
    return result


def get_processes() -> dict:
    try:
        r = subprocess.run(["ps", "aux", "--sort=-%cpu"], capture_output=True, text=True, timeout=5)
        lines = r.stdout.strip().split("\n")[1:11]
        by_cpu = []
        for line in lines:
            parts = line.split(None, 10)
            if len(parts) >= 11:
                by_cpu.append(
                    {
                        "user": parts[0],
                        "pid": int(parts[1]),
                        "cpu": float(parts[2]),
                        "mem": float(parts[3]),
                        "command": parts[10][:80],
                    }
                )
        r2 = subprocess.run(["ps", "aux", "--sort=-%mem"], capture_output=True, text=True, timeout=5)
        lines2 = r2.stdout.strip().split("\n")[1:11]
        by_mem = []
        for line in lines2:
            parts = line.split(None, 10)
            if len(parts) >= 11:
                by_mem.append(
                    {
                        "user": parts[0],
                        "pid": int(parts[1]),
                        "cpu": float(parts[2]),
                        "mem": float(parts[3]),
                        "command": parts[10][:80],
                    }
                )
        return {"by_cpu": by_cpu, "by_mem": by_mem}
    except Exception as e:
        return {"error": str(e)}


def get_storage() -> dict:
    now = time.time()
    if _storage_cache["data"] and (now - _storage_cache["ts"]) < _STORAGE_TTL:
        return _storage_cache["data"]
    # Serialize refreshes — concurrent expiry would otherwise spawn parallel
    # `du` scans over the whole media tree. Late arrivals serve the stale copy.
    if not _storage_lock.acquire(blocking=False):
        return _storage_cache["data"] or {"dirs": []}
    try:
        return _scan_storage()
    finally:
        _storage_lock.release()


def _scan_storage() -> dict:
    now = time.time()
    result = {"dirs": []}
    try:
        usage = shutil.disk_usage("/")
        result["total_gb"] = round(usage.total / 1073741824, 1)
        result["used_gb"] = round(usage.used / 1073741824, 1)
        result["free_gb"] = round(usage.free / 1073741824, 1)
    except Exception:
        result["total_gb"] = result["used_gb"] = result["free_gb"] = 0
    media = Path(settings.media_path)
    if media.exists():
        for d in sorted(media.iterdir()):
            if d.is_dir():
                try:
                    r = subprocess.run(["du", "-sb", str(d)], capture_output=True, text=True, timeout=60)
                    if r.returncode == 0:
                        size = int(r.stdout.split()[0])
                        result["dirs"].append({"name": d.name, "size_bytes": size})
                except Exception:
                    pass
    dl = Path("/data/downloads")
    if dl.exists():
        try:
            r = subprocess.run(["du", "-sb", str(dl)], capture_output=True, text=True, timeout=60)
            if r.returncode == 0:
                size = int(r.stdout.split()[0])
                result["dirs"].append({"name": "downloads", "size_bytes": size})
        except Exception:
            pass
    _storage_cache["data"] = result
    _storage_cache["ts"] = now
    return result


async def get_weather() -> dict:
    now = time.time()
    if _weather_cache["data"] and (now - _weather_cache["ts"]) < _WEATHER_TTL:
        return _weather_cache["data"]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            url = f"https://wttr.in/{settings.weather_city}?format=j1"
            resp = await client.get(url, headers={"User-Agent": "curl/7.0"})
            raw = resp.json()
        cur = raw.get("current_condition", [{}])[0]
        result = {
            "temp_c": cur.get("temp_C", "?"),
            "feels_like": cur.get("FeelsLikeC", "?"),
            "condition": cur.get("weatherDesc", [{"value": "?"}])[0].get("value", "?"),
            "humidity": cur.get("humidity", "?"),
            "wind_kph": cur.get("windspeedKmph", "?"),
            "wind_dir": cur.get("winddir16Point", ""),
            "uv": cur.get("uvIndex", "?"),
            "visibility": cur.get("visibility", "?"),
            "city": settings.weather_city,
        }
        _weather_cache["data"] = result
        _weather_cache["ts"] = now
        return result
    except Exception as e:
        return {"error": str(e)}


def get_bandwidth_history() -> list:
    with _bw_lock:
        return list(bw_history)


def start_bandwidth_collector(qbit_request_fn):
    """Start background thread that polls qBittorrent transfer info every 5s."""

    def _collector():
        while True:
            try:
                data = qbit_request_fn("/transfer/info")
                if data and not data.get("error"):
                    entry = {"ts": time.time(), "dl": data.get("dl_info_speed", 0), "ul": data.get("up_info_speed", 0)}
                    with _bw_lock:
                        bw_history.append(entry)
                        if len(bw_history) > _BW_MAX:
                            del bw_history[: len(bw_history) - _BW_MAX]
            except Exception:
                pass
            time.sleep(5)

    t = threading.Thread(target=_collector, daemon=True)
    t.start()
