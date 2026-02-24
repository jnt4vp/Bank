# Bank

Current implementation status:
- Frontend: React/Vite placeholder UI
- Backend: FastAPI auth API (JWT + PostgreSQL)

## Frontend (placeholder)

```bash
npm install
npm run dev
```

## Backend (auth API)

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..
alembic upgrade head
uvicorn backend.main:app --reload
```

## Production Deployment

Canonical production deployment in this repo is `docker-compose.prod.yml`.
The `deploy/` directory contains an alternative systemd + nginx API deployment.
