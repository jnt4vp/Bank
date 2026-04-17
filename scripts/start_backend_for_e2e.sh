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
Install Docker Compose or rerun with SKIP_DB_START=1 against an existing Postgres instance.
EOF
  exit 1
}

pick_backend_cmd() {
  if [[ -x "$ROOT_DIR/.venv/bin/uvicorn" ]]; then
    BACKEND_CMD=("$ROOT_DIR/.venv/bin/uvicorn")
    return 0
  fi

  if command -v uvicorn >/dev/null 2>&1; then
    BACKEND_CMD=(uvicorn)
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

ensure_env_file() {
  if [[ ! -f "$ROOT_DIR/.env" && -f "$ROOT_DIR/.env.example" ]]; then
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    echo "Created .env from .env.example"
  fi
}

pick_compose_cmd
pick_backend_cmd
pick_alembic_cmd
ensure_env_file

if [[ "${SKIP_DB_START:-0}" != "1" ]]; then
  echo "Starting PostgreSQL for E2E with ${COMPOSE_CMD[*]} up -d"
  "${COMPOSE_CMD[@]}" up -d
fi

echo "Applying database migrations for E2E"
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

echo "Starting FastAPI backend for E2E on http://127.0.0.1:8000"
exec env OLLAMA_ENABLED=false "${BACKEND_CMD[@]}" backend.main:app --host 127.0.0.1 --port 8000
