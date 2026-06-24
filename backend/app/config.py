from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8002

    # Default to qbittorrent so existing installs (which predate the
    # transmission option) keep working without setting TORRENT_CLIENT.
    # New installs can opt in by setting TORRENT_CLIENT=transmission in .env.
    torrent_client: str = "qbittorrent"  # "transmission" or "qbittorrent"

    qbit_base: str = "http://localhost:8080/api/v2"
    qbit_user: str = ""
    qbit_pass: str = ""

    transmission_base: str = "http://localhost:9091/transmission/rpc"
    transmission_user: str = ""
    transmission_pass: str = ""

    jellyfin_base: str = "http://localhost:8096"
    jellyfin_api_key: str = ""

    media_path: str = "/data/media"
    file_home: str = ""
    weather_city: str = ""

    tmdb_api_key: str = ""
    tmdb_base: str = "https://api.themoviedb.org/3"

    omdb_api_key: str = ""

    # Dashboard API key — protects direct backend access from non-localhost clients
    # Generate one with: python3 -c "import secrets; print(secrets.token_urlsafe(32))"
    api_key: str = ""

    # Human-memorable unlock password. When set, POST /api/auth/unlock
    # exchanges it for the API key so new devices never need the raw key.
    dashboard_password: str = ""

    # Public base URL for shareable movie links, served via Tailscale Funnel.
    # e.g. https://jackal.tail46a969.ts.net:10000  (must point at this backend)
    # Leave empty to disable the share feature.
    public_share_base: str = ""

    # Comma-separated list of enabled feature modules, or "all" (default).
    # Recognized: system,docker,torrents,media,discover,files,tasks,notes
    # `discover` is always on regardless of this setting.
    enabled_features: str = "all"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    _ALL_FEATURES = ("system", "docker", "torrents", "media", "discover", "files", "tasks", "notes")

    def feature_set(self) -> set[str]:
        raw = (self.enabled_features or "all").strip().lower()
        if raw in ("", "all", "*"):
            features = set(self._ALL_FEATURES)
        else:
            features = {p.strip() for p in raw.split(",") if p.strip()}
        features.add("discover")
        return features

    def feature_enabled(self, name: str) -> bool:
        return name in self.feature_set()


settings = Settings()
