import threading

from cachetools import TTLCache


class LockedTTLCache:
    """Thread-safe wrapper around cachetools.TTLCache.

    TTLCache mutates internal state on reads (expiry) and is documented as
    not thread-safe; this app touches its caches from ThreadPoolExecutor
    workers and FastAPI's request threadpool concurrently.
    """

    def __init__(self, maxsize: int, ttl: int):
        self._cache: TTLCache = TTLCache(maxsize=maxsize, ttl=ttl)
        self._lock = threading.Lock()

    def __getitem__(self, key):
        with self._lock:
            return self._cache[key]

    def __setitem__(self, key, value):
        with self._lock:
            self._cache[key] = value

    def __contains__(self, key) -> bool:
        with self._lock:
            return key in self._cache

    def get(self, key, default=None):
        with self._lock:
            return self._cache.get(key, default)
