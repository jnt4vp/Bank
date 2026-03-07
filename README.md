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
- Ollama (optional, but required for LLM classification)

On Linux, you may also need Docker socket permissions before `make dev` works:

```bash
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
docker ps
```

(`docker-compose` also works if installed, but `docker compose` is the modern command.)

## Fast Start (One Command)

After completing the one-time setup steps (`cp .env.example .env`, backend deps, and `cd frontend && npm install`), you can start local development with:

```bash
make dev
```

This starts:

- PostgreSQL (Docker)
- FastAPI backend (`:8000`)
- Vite frontend (`:5173`)

`make dev` applies pending Alembic migrations automatically before starting the backend.

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

Run database migrations if you are starting the API manually without `make dev`:

```bash
alembic upgrade head
```

`make dev` already does this step for you on each startup.

Start the API from the repo root:

```bash
uvicorn backend.main:app --reload
```

Backend URLs:

- API: `http://localhost:8000`
- Docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/health`

## 4. Enable LLM Classification (Ollama, Optional)

The classifier has a rule-based layer and an optional LLM layer. The LLM layer calls Ollama at `http://localhost:11434` using model `llama3.2:1b` by default.

Install and run Ollama locally (Linux):

```bash
curl -fsSL https://ollama.com/install.sh | sudo sh
ollama serve
ollama pull llama3.2:1b
```

If `ollama serve` is already running as a background service, you only need `ollama pull llama3.2:1b` once.

Optional `.env` overrides:

```bash
OLLAMA_ENABLED=true
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:1b
```

To run without Ollama, set:

```bash
OLLAMA_ENABLED=false
```

## 5. Frontend Setup (Vite)

In a new terminal, from the repo root:

```bash
cd frontend
npm install
npm run dev
```

Frontend URL:

- App: `http://localhost:5173`

## 6. Quick API Smoke Test (Optional)

In development, `make dev` automatically creates this example account unless you disable `DEV_SEED_EXAMPLE_USER` in `.env`:

- Email: `test@example.com`
- Password: `password123`

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

## 7. Transaction Classifier Smoke Test

Send a transaction through the real API classifier:

```bash
python scripts/send_transaction.py \
  --email test@example.com \
  --password password123 \
  --merchant "DraftKings" \
  --desc "Weekly sports bet" \
  --amount 250
```

Then check that user's stored transactions:

```bash
curl http://localhost:8000/api/transactions \
  -H "Authorization: Bearer <paste access_token from login response>"
```

You should see classifier fields on each transaction row:

- `flagged` (`true` / `false`)
- `category` (`gambling`, `adult`, `alcohol`, `drugs`, or `null`)
- `flag_reason` (rule keyword or `LLM: ...`)

If Ollama is down/unreachable, the backend gracefully skips the LLM step and still stores the transaction unflagged.

More classifier details: `backend/services/CLASSIFIER.md`.

## 8. Tests (Beginner Feedback Loop)

Backend smoke test:

```bash
make test-backend
```

Frontend smoke test:

```bash
npm --prefix frontend test
```

Run both:

```bash
make test
```

## 9. Common Commands

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

If you use `make dev` after the reset, you can skip the manual `alembic upgrade head` because the dev script applies it automatically.

## 10. Notes

- `docker-compose.prod.yml` and `deploy/` contain deployment options (organized as `deploy/docker/` and `deploy/systemd-nginx/`), but this README is intentionally local-dev only.
- EC2 Docker deployment guide: `deploy/docker/README.md`.
- The frontend is currently a placeholder UI and does not yet implement the full product flows described in `docs/SPEC.md`.
- `make dev` leaves the Postgres container running when you stop the frontend/backend. Use `docker compose down` to stop it.
- `make dev` applies pending Alembic migrations automatically before launching the backend.
- `make dev-no-db` skips Docker and assumes Postgres is already running and matches `DATABASE_URL`.
- `docker-compose.prod.yml` applies `alembic upgrade head` automatically before the production API starts.
- The local scripts support both `docker compose` and `docker-compose`.
- Test convention: backend tests are colocated in `backend/tests`; add frontend tests colocated under `frontend/src/` when the UI grows.
