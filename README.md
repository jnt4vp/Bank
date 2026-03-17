# Bank

Local development guide for the current repo snapshot.

## Current Scope

- Backend: FastAPI with auth, transactions, Plaid bank sync, pacts, and accountability settings
- Frontend: Vite + React with registration flow, Plaid Link bank connection, and dashboard
- Database: PostgreSQL (recommended via Docker for local dev)
- Plaid integration: sandbox mode by default, background polling for transaction sync

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

## 5. Enable Plaid Bank Connection (Optional)

Plaid allows users to connect real bank accounts. In development, use the **sandbox** environment which provides test credentials without real bank access.

1. Sign up for a free Plaid account at [dashboard.plaid.com](https://dashboard.plaid.com)
2. Get your sandbox credentials from the Plaid dashboard (Keys page)
3. Add to your `.env`:

```bash
PLAID_CLIENT_ID=your-client-id
PLAID_SECRET=your-sandbox-secret
PLAID_ENV=sandbox
PLAID_POLL_INTERVAL_MINUTES=30
PLAID_TOKEN_KEY=          # optional; falls back to JWT_SECRET
```

With sandbox credentials configured, users can connect test banks during registration using Plaid Link. The backend polls for new transactions every 30 minutes (configurable).

If Plaid credentials are not set, the poller is disabled and the Plaid endpoints return errors — the rest of the app works normally.

### Sandbox Testing

In sandbox mode, Plaid Link shows test institutions. Use these credentials when prompted:
- Username: `user_good`
- Password: `pass_good`

## 6. Frontend Setup (Vite)

In a new terminal, from the repo root:

```bash
cd frontend
npm install
npm run dev
```

Frontend URL:

- App: `http://localhost:5173`

## 7. Quick API Smoke Test (Optional)

By default, the app automatically creates this example account unless you disable `DEV_SEED_EXAMPLE_USER` in `.env`:

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

## 8. Transaction Classifier Smoke Test

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

## 9. Tests

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

### End-to-End Tests (Playwright)

E2E tests live in `frontend/e2e/` and use [Playwright](https://playwright.dev/) to drive a real browser against the running app. They cover auth flows (login, register, forgot password, protected routes) and dashboard functionality (counter, logout, session persistence).

Prerequisites:

```bash
cd frontend
npm install                    # installs @playwright/test
npx playwright install chromium
```

Run the tests (requires `make dev` running in another terminal, or Playwright will auto-start the Vite dev server):

```bash
make test-e2e                  # headless
npm --prefix frontend run test:e2e:headed  # with visible browser
```

The tests use the dev seed account (`test@example.com` / `password123`).

## 10. Common Commands

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

## 11. Notes

- `docker-compose.prod.yml` and `deploy/` contain deployment options (organized as `deploy/docker/` and `deploy/systemd-nginx/`), but this README is intentionally local-dev only.
- EC2 Docker deployment guide: `deploy/docker/README.md`.
- The frontend is currently a placeholder UI and does not yet implement the full product flows described in `docs/SPEC.md`.
- `make dev` leaves the Postgres container running when you stop the frontend/backend. Use `docker compose down` to stop it.
- `make dev` applies pending Alembic migrations automatically before launching the backend.
- `make dev-no-db` skips Docker and assumes Postgres is already running and matches `DATABASE_URL`.
- `docker-compose.prod.yml` applies `alembic upgrade head` automatically before the production API starts.
- The local scripts support both `docker compose` and `docker-compose`.
- Test convention: backend unit tests live in `backend/tests/`; frontend e2e tests live in `frontend/e2e/`.
