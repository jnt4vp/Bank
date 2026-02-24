# Bank

Local development guide for the current repo snapshot.

## Current Scope

- Backend: FastAPI auth endpoints (`/api/auth/register`, `/api/auth/login`, `/api/auth/me`)
- Frontend: Vite + React placeholder app
- Database: PostgreSQL (recommended via Docker for local dev)

## Prerequisites

- Node.js 20+
- Python 3.11+
- Docker (for local Postgres)

## 1. Start Postgres

From the repo root:

```bash
docker-compose up -d
```

This starts a local Postgres instance on `localhost:5432`.

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

## Common Commands

Stop local Postgres:

```bash
docker-compose down
```

Reset local Postgres data:

```bash
docker-compose down -v
docker-compose up -d
alembic upgrade head
```

## Notes

- `docker-compose.prod.yml` and `deploy/` contain deployment options, but this README is intentionally local-dev only.
- The frontend is currently a placeholder UI and does not yet implement the full product flows described in `SPEC.md`.
