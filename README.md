# Bank Spank

A mock financial accountability app that detects irresponsible purchases using AI classification and sends alerts to users. Simulates bank integration via external POST requests.

## Current Status

- **Backend**: Auth endpoints live (`/api/auth/register`, `/api/auth/login`, `/api/auth/me`) — FastAPI + PostgreSQL
- **Frontend**: Placeholder React/Vite screen
- **Deployment**: Docker Compose on EC2 (see [Production Deployment](#production-deployment))

## Tech Stack

- **Frontend**: React 19 + Vite + Tailwind CSS + React Router
- **Backend**: Python 3.11+ + FastAPI + SQLAlchemy + asyncpg
- **Database**: PostgreSQL 15
- **AI Classification**: Hybrid — Rule-based + optional Ollama LLM
- **Alerts**: Email (SMTP) + Mock SMS (console logging)

## Architecture

```
Internet :80 → bank_frontend (nginx) → serves React SPA at /
                                      → proxies /api/* to bank_api:8000
bank_api (uvicorn) → bank_postgres (postgres:15)
```

## API Endpoints

### Auth
| Method | Endpoint             | Description        |
|--------|----------------------|--------------------|
| POST   | `/api/auth/register` | Create new user    |
| POST   | `/api/auth/login`    | Login, returns JWT |
| GET    | `/api/auth/me`       | Get current user   |

### Transactions
| Method | Endpoint                    | Description                           |
|--------|-----------------------------|---------------------------------------|
| POST   | `/api/transactions`         | Ingest new transaction (API key auth) |
| GET    | `/api/transactions`         | Get user's transactions               |
| GET    | `/api/transactions/flagged` | Get flagged transactions              |

### Alerts & Card
| Method | Endpoint          | Description          |
|--------|-------------------|----------------------|
| GET    | `/api/alerts`     | Get user's alerts    |
| POST   | `/api/card/lock`  | Lock card (mock)     |
| POST   | `/api/card/unlock`| Unlock card (mock)   |
| GET    | `/api/card/status`| Get card lock status |

## Local Development

```bash
# 1. Start PostgreSQL
docker-compose up -d

# 2. Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # edit with your settings
cd ..
alembic upgrade head
uvicorn backend.main:app --reload

# 3. Frontend (new terminal)
npm install
npm run dev

# 4. (Optional) Ollama for AI classification
curl -fsSL https://ollama.com/install.sh | sh
ollama pull phi3

# 5. (Optional) Transaction simulator
python scripts/simulator.py
```

## Environment Variables

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/bankspank
JWT_SECRET=your-secret-key-here
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=60

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# SMS (mock by default)
SMS_MODE=mock  # or "twilio"
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Ollama (optional)
OLLAMA_ENABLED=true
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=phi3
```

## Production Deployment

Canonical production deployment is `docker-compose.prod.yml` on EC2. See [`deploy/EC2_DOCKER_DEPLOY.md`](deploy/EC2_DOCKER_DEPLOY.md) for the full guide.

```bash
# Quick upgrade on EC2
cd /opt/bankapp
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d --build
```

The `deploy/` directory also contains an alternative systemd + nginx deployment path (legacy).
