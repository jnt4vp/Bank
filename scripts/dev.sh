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

pick_alembic_cmd() {
  if [[ -x "$ROOT_DIR/.venv/bin/alembic" ]]; then
    ALEMBIC_CMD=("$ROOT_DIR/.venv/bin/alembic" -c "$ROOT_DIR/alembic.ini")
    return 0
  fi

  if command -v alembic >/dev/null 2>&1; then
    ALEMBIC_CMD=(alembic -c "$ROOT_DIR/alembic.ini")
    return 0
  fi

  echo "alembic not found. Install backend deps first (see README)." >&2
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
pick_alembic_cmd
require_frontend_deps
ensure_env_file

DB_MODE="docker"

if [[ "${SKIP_DB_START:-0}" == "1" ]]; then
  DB_MODE="external"
  echo "Skipping PostgreSQL startup (SKIP_DB_START=1)."
else
  echo "Starting PostgreSQL with ${COMPOSE_CMD[*]} up -d"
  set +e
  COMPOSE_OUTPUT="$("${COMPOSE_CMD[@]}" up -d 2>&1)"
  COMPOSE_STATUS=$?
  set -e

  if [[ -n "$COMPOSE_OUTPUT" ]]; then
    printf '%s\n' "$COMPOSE_OUTPUT"
  fi

  if (( COMPOSE_STATUS != 0 )); then
    if grep -qi "address already in use" <<<"$COMPOSE_OUTPUT"; then
      DB_MODE="external"
      cat >&2 <<'EOF'

PostgreSQL container could not bind to host port 5432 because it is already in use.

Continuing with the existing PostgreSQL server referenced by DATABASE_URL instead.
If that is not the database you want, stop the service using port 5432 and rerun `make dev`.
EOF
    else
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
fi

echo "Applying database migrations with ${ALEMBIC_CMD[*]} upgrade head"
MIGRATION_ATTEMPT=1
until "${ALEMBIC_CMD[@]}" upgrade head; do
  if (( MIGRATION_ATTEMPT >= 15 )); then
    echo "Failed to apply database migrations after ${MIGRATION_ATTEMPT} attempts." >&2
    exit 1
  fi

  echo "Database not ready for migrations yet. Retrying (${MIGRATION_ATTEMPT}/15)..."
  MIGRATION_ATTEMPT=$((MIGRATION_ATTEMPT + 1))
  sleep 1
done

echo "Starting FastAPI backend on http://localhost:8000"
"${BACKEND_CMD[@]}" &
BACKEND_PID=$!

echo "Starting Vite frontend on http://localhost:5173"
(
  cd "$FRONTEND_DIR"
  npm run dev
) &
FRONTEND_PID=$!

if [[ "$DB_MODE" == "external" ]]; then
  echo "Dev stack is running (backend + frontend). Press Ctrl-C to stop both."
  echo "Using the existing PostgreSQL instance referenced by DATABASE_URL."
else
  echo "Dev stack is running (Postgres + backend + frontend). Press Ctrl-C to stop backend/frontend."
fi
echo "Database migrations were applied automatically on startup."

trap cleanup EXIT INT TERM

wait_for_first_exit "$BACKEND_PID" "$FRONTEND_PID"
