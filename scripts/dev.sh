#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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
  if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
    echo "node_modules/ is missing. Run npm install first." >&2
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

pick_compose_cmd
pick_backend_cmd
require_frontend_deps
ensure_env_file

if [[ "${SKIP_DB_START:-0}" == "1" ]]; then
  echo "Skipping PostgreSQL startup (SKIP_DB_START=1)."
else
  echo "Starting PostgreSQL with ${COMPOSE_CMD[*]} up -d"
  "${COMPOSE_CMD[@]}" up -d
fi

echo "Starting FastAPI backend on http://localhost:8000"
"${BACKEND_CMD[@]}" &
BACKEND_PID=$!

echo "Starting Vite frontend on http://localhost:5173"
npm run dev &
FRONTEND_PID=$!

if [[ "${SKIP_DB_START:-0}" == "1" ]]; then
  echo "Dev stack is running (backend + frontend). Press Ctrl-C to stop both."
  echo "Make sure PostgreSQL is already running and reachable via DATABASE_URL."
else
  echo "Dev stack is running (Postgres + backend + frontend). Press Ctrl-C to stop backend/frontend."
fi
echo "If this is your first run, make sure you already ran: alembic upgrade head"

trap cleanup EXIT INT TERM

wait -n "$BACKEND_PID" "$FRONTEND_PID"
