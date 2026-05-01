#!/usr/bin/env bash
# Jarvis Dashboard one-shot installer / launcher.
#
# Usage:
#   ./setup.sh              # run interactive config (writes .env)
#   ./setup.sh run          # config if needed, then launch native (venv + npm)
#   ./setup.sh run docker   # config if needed, then launch via docker compose
#
# Idempotent: re-running preserves existing .env values as defaults.
# Does not touch running servers unless you ask it to.

set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

log()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m  %s\n' "$*" >&2; }
fail() { printf '\033[1;31mXX\033[0m  %s\n' "$*" >&2; exit 1; }

require() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required tool: $1"
}

check_prereqs_native() {
  require python3
  require node
  require npm
  # Python >= 3.10 for the `set[str]` syntax in config.py
  python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' \
    || fail "python3 >= 3.10 required (found $(python3 --version))"
}

check_prereqs_docker() {
  require docker
  if ! docker compose version >/dev/null 2>&1; then
    fail "docker compose plugin not found — install Docker Compose v2"
  fi
}

ensure_env() {
  if [[ ! -f "$REPO_ROOT/.env" ]]; then
    log "no .env found — running interactive setup"
    python3 "$REPO_ROOT/scripts/setup.py"
  else
    log ".env exists — skipping setup (run ./setup.sh to reconfigure)"
  fi
}

install_backend() {
  log "setting up backend venv"
  cd "$REPO_ROOT/backend"
  if [[ ! -d venv ]]; then
    python3 -m venv venv
  fi
  # shellcheck disable=SC1091
  source venv/bin/activate
  pip install --quiet --upgrade pip
  pip install --quiet -r requirements.txt
  deactivate
  cd "$REPO_ROOT"
}

install_frontend() {
  log "installing frontend dependencies"
  cd "$REPO_ROOT/frontend"
  if [[ -f package-lock.json ]]; then
    npm ci --no-audit --no-fund --silent
  else
    npm install --no-audit --no-fund --silent
  fi
  cd "$REPO_ROOT"
}

launch_native() {
  check_prereqs_native
  ensure_env
  install_backend
  install_frontend

  log "starting backend on :8002"
  cd "$REPO_ROOT/backend"
  # shellcheck disable=SC1091
  source venv/bin/activate
  uvicorn app.main:app --host 0.0.0.0 --port 8002 &
  BACKEND_PID=$!
  deactivate
  cd "$REPO_ROOT"

  log "starting frontend on :3000"
  cd "$REPO_ROOT/frontend"
  npm run dev -- -p 3000 &
  FRONTEND_PID=$!
  cd "$REPO_ROOT"

  log "backend pid=$BACKEND_PID  frontend pid=$FRONTEND_PID"
  log "open http://localhost:3000 — Ctrl-C to stop"
  trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true' INT TERM
  wait
}

launch_docker() {
  check_prereqs_docker
  ensure_env
  log "building and starting via docker compose"
  docker compose up --build
}

case "${1:-configure}" in
  configure|"")
    check_prereqs_native
    python3 "$REPO_ROOT/scripts/setup.py"
    ;;
  run)
    mode="${2:-native}"
    case "$mode" in
      native) launch_native ;;
      docker) launch_docker ;;
      *) fail "unknown run mode: $mode (use 'native' or 'docker')" ;;
    esac
    ;;
  -h|--help|help)
    sed -n '2,12p' "$0"
    ;;
  *)
    fail "unknown command: $1 (try: ./setup.sh --help)"
    ;;
esac
