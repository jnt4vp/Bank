#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
cd "$ROOT_DIR"

pick_compose_cmd() {
  if [[ "${SKIP_DB_START:-0}" == "1" ]]; then
    COMPOSE_CMD=()
    return 0
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
    return 0
  fi

  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
    return 0
  fi

  cat >&2 <<'EOF'
Docker Compose is not available (expected `docker-compose` or `docker compose`).

Options:
  1. Install Docker + Docker Compose, then rerun `make dev`
  2. Start PostgreSQL manually, then run `make dev-no-db`
     (or `SKIP_DB_START=1 make dev`)
EOF
  exit 1
}

pick_backend_cmd() {
  if [[ -x "$ROOT_DIR/.venv/bin/uvicorn" ]]; then
    BACKEND_CMD=("$ROOT_DIR/.venv/bin/uvicorn" backend.main:app --reload)
    return 0
  fi

  if command -v uvicorn >/dev/null 2>&1; then
    BACKEND_CMD=(uvicorn backend.main:app --reload)
    return 0
  fi

  echo "uvicorn not found. Install backend deps first (see README)." >&2
  exit 1
}

require_frontend_deps() {
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo "frontend/node_modules/ is missing. Run npm install in frontend/ first." >&2
    exit 1
  fi
}

ensure_env_file() {
  if [[ ! -f "$ROOT_DIR/.env" && -f "$ROOT_DIR/.env.example" ]]; then
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    echo "Created .env from .env.example"
  fi
}

cleanup() {
  trap - EXIT INT TERM

  for pid in "${FRONTEND_PID:-}" "${BACKEND_PID:-}"; do
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done

  wait "${FRONTEND_PID:-}" 2>/dev/null || true
  wait "${BACKEND_PID:-}" 2>/dev/null || true
}

wait_for_first_exit() {
  # `wait -n` is unavailable in macOS's default Bash 3.2.
  if (( BASH_VERSINFO[0] > 4 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] >= 3) )); then
    wait -n "$@"
    return $?
  fi

  local pid
  while true; do
    for pid in "$@"; do
      if ! kill -0 "$pid" 2>/dev/null; then
        wait "$pid" 2>/dev/null
        return $?
      fi
    done
    sleep 1
  done
}

pick_compose_cmd
pick_backend_cmd
require_frontend_deps
ensure_env_file

if [[ "${SKIP_DB_START:-0}" == "1" ]]; then
  echo "Skipping PostgreSQL startup (SKIP_DB_START=1)."
else
  echo "Starting PostgreSQL with ${COMPOSE_CMD[*]} up -d"
  if ! "${COMPOSE_CMD[@]}" up -d; then
    cat >&2 <<'EOF'

PostgreSQL container failed to start.

If the error mentions `address already in use` for port `5432`, another service is already bound to that port.
Options:
  1. Stop the service/container using port 5432, then rerun `make dev`
  2. Keep using your existing Postgres and run `make dev-no-db`
     (make sure `DATABASE_URL` points to that running database)
EOF
    exit 1
  fi
fi

echo "Starting FastAPI backend on http://localhost:8000"
"${BACKEND_CMD[@]}" &
BACKEND_PID=$!

echo "Starting Vite frontend on http://localhost:5173"
(
  cd "$FRONTEND_DIR"
  npm run dev
) &
FRONTEND_PID=$!

if [[ "${SKIP_DB_START:-0}" == "1" ]]; then
  echo "Dev stack is running (backend + frontend). Press Ctrl-C to stop both."
  echo "Make sure PostgreSQL is already running and reachable via DATABASE_URL."
else
  echo "Dev stack is running (Postgres + backend + frontend). Press Ctrl-C to stop backend/frontend."
fi
echo "If this is your first run, make sure you already ran: alembic upgrade head"

trap cleanup EXIT INT TERM

wait_for_first_exit "$BACKEND_PID" "$FRONTEND_PID"
