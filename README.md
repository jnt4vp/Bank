# Bank

Local development guide for the current repo snapshot.

## Current Scope

- Backend: FastAPI auth endpoints (`/api/auth/register`, `/api/auth/login`, `/api/auth/me`)
- Frontend: Vite + React placeholder app
- Database: PostgreSQL (recommended via Docker for local dev)

## Prerequisites

- Node.js 20+
- Python 3.11+
- Docker Engine + Docker Compose plugin (`docker compose`) for local Postgres

On Linux, you may also need Docker socket permissions before `make dev` works:

```bash
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
docker ps
```

(`docker-compose` also works if installed, but `docker compose` is the modern command.)

## Fast Start (One Command)

After completing the one-time setup steps (`cp .env.example .env`, backend deps, `npm install`, and first-run migrations), you can start local development with:

```bash
make dev
```

This starts:

- PostgreSQL (Docker)
- FastAPI backend (`:8000`)
- Vite frontend (`:5173`)

First run only (before `make dev`), initialize the database schema:

```bash
alembic upgrade head
```

If you do not have Docker Compose installed but already have PostgreSQL running locally, use:

```bash
make dev-no-db
```

If `make dev` fails with `address already in use` for port `5432`, another Postgres instance is already running. Either stop it, or keep using your existing Postgres and run `make dev-no-db`.

## 1. Start Postgres

From the repo root:

```bash
docker compose up -d
```

This starts a local Postgres instance on `localhost:5432`.

Preflight check (helps catch Docker permission issues early):

```bash
docker ps
```

If port `5432` is already in use, use `make dev-no-db` and point `.env` at your existing Postgres.

## 2. Configure Environment

Create a local env file in the repo root:

```bash
cp .env.example .env
```

Defaults in `.env.example` are already set for the local Docker Postgres container.

## 3. Backend Setup (FastAPI)

Create a virtual environment and install backend dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

Run database migrations:

```bash
alembic upgrade head
```

You only need this once on first setup (and again after future migration changes).

Start the API from the repo root:

```bash
uvicorn backend.main:app --reload
```

Backend URLs:

- API: `http://localhost:8000`
- Docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/health`

## 4. Frontend Setup (Vite)

In a new terminal, from the repo root:

```bash
npm install
npm run dev
```

Frontend URL:

- App: `http://localhost:5173`

## 5. Quick API Smoke Test (Optional)

Register:

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'
```

Login:

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

## 6. Tests (Beginner Feedback Loop)

Backend smoke test:

```bash
make test-backend
```

Frontend smoke test:

```bash
npm test
```

Run both:

```bash
make test
```

## Common Commands

Stop local Postgres:

```bash
docker compose down
```

Reset local Postgres data:

```bash
docker compose down -v
docker compose up -d
alembic upgrade head
```

## Notes

- `docker-compose.prod.yml` and `deploy/` contain deployment options, but this README is intentionally local-dev only.
- The frontend is currently a placeholder UI and does not yet implement the full product flows described in `SPEC.md`.
- `make dev` leaves the Postgres container running when you stop the frontend/backend. Use `docker compose down` to stop it.
- `make dev-no-db` skips Docker and assumes Postgres is already running and matches `DATABASE_URL`.
- The local scripts support both `docker compose` and `docker-compose`.
