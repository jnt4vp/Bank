# Bank Spank - Software Specification

## Overview
A mock financial accountability app that detects irresponsible purchases using AI classification and sends alerts to users. Simulates bank integration via external POST requests.

## Tech Stack
- **Frontend**: React 19 + Vite + Tailwind CSS + React Router
- **Backend**: Python 3.11+ + FastAPI
- **Database**: PostgreSQL 15+
- **AI Classification**: Hybrid (Rule-based + Ollama optional)
- **Messaging**: Email (SMTP) + Mock SMS (console logging for demo)

---

## Architecture

```
┌─────────────────┐                              ┌─────────────────────────────────┐
│   React App     │◄────────────────────────────►│       FastAPI Backend           │
│  (Vite + TW)    │         REST API             │                                 │
└─────────────────┘                              │  ┌─────────────────────────┐    │
                                                 │  │  Auth (JWT)             │    │
┌─────────────────┐    POST /api/transactions    │  │  Transaction Handler    │    │
│   Simulator     │─────────────────────────────►│  │  AI Classifier          │    │
│   Script        │                              │  │  Alert Service          │    │
└─────────────────┘                              │  └─────────────────────────┘    │
                                                 └──────────────┬──────────────────┘
                                                                │
                                                 ┌──────────────▼──────────────────┐
                                                 │         PostgreSQL              │
                                                 │  users, transactions, alerts    │
                                                 └─────────────────────────────────┘
```

---

## Database Schema

### `users`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| email | VARCHAR(255) | Unique, for login |
| password_hash | VARCHAR(255) | bcrypt hashed |
| phone | VARCHAR(20) | For SMS alerts (nullable) |
| name | VARCHAR(100) | Display name |
| card_locked | BOOLEAN | Mock card lock status |
| created_at | TIMESTAMP | Account creation |

### `transactions`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK to users |
| merchant | VARCHAR(255) | Merchant name |
| category | VARCHAR(100) | Merchant category |
| amount | DECIMAL(10,2) | Transaction amount |
| flagged | BOOLEAN | If AI flagged it |
| flag_reason | TEXT | Why it was flagged |
| created_at | TIMESTAMP | Transaction time |

### `alerts`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK to users |
| transaction_id | UUID | FK to transactions |
| message | TEXT | Alert content |
| sent_via | VARCHAR(20) | 'email', 'sms' |
| sent_at | TIMESTAMP | When sent |

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create new user |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/me` | Get current user |

### Transactions (External - for simulator)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/transactions` | Ingest new transaction (API key auth) |

### User Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/transactions` | Get user's transactions |
| GET | `/api/transactions/flagged` | Get flagged transactions |
| GET | `/api/alerts` | Get user's alerts |
| POST | `/api/card/lock` | Lock card (mock) |
| POST | `/api/card/unlock` | Unlock card (mock) |
| GET | `/api/card/status` | Get card lock status |

---

## Frontend Pages

### 1. Landing Page (`/`)
- Hero section with app name "Bank Spank" and tagline
- Feature highlights (AI detection, alerts, card lock)
- CTA buttons: Sign Up / Login

### 2. Login Page (`/login`)
- Email + password form
- Link to register
- JWT stored in localStorage

### 3. Register Page (`/register`)
- Name, email, password, phone (optional)
- Redirects to dashboard on success

### 4. Dashboard (`/dashboard`)
- **Header**: User name, logout button
- **Card Status Widget**: Shows locked/unlocked, toggle button
- **Recent Transactions**: List with flagged items highlighted in red
- **Alerts Feed**: Recent alerts/warnings
- **Stats**: Total spent, flagged count, etc.

---

## AI Classification System

### Hybrid Approach (Recommended)

**Layer 1: Rule-Based (Always runs - instant)**
```python
FLAGGED_KEYWORDS = {
    "gambling": ["casino", "bet365", "draftkings", "fanduel", "poker", "slots", "lottery", "betting"],
    "adult": ["adult", "strip club", "onlyfans"],
    "high_risk": ["payday loan", "cash advance", "pawn shop", "title loan"],
    "excessive": []  # Amount-based: flag purchases > $500 at luxury/entertainment
}
```

**Layer 2: Ollama LLM (Optional - for ambiguous cases)**
- Only called if rule-based doesn't catch it AND amount > $50
- Uses small local model (phi3, gemma:2b, or llama3.2:1b)
- Gracefully skips if Ollama not installed

```python
# Ollama setup (3 commands)
# curl -fsSL https://ollama.com/install.sh | sh
# ollama pull phi3
# API auto-available at http://localhost:11434

def classify_with_ollama(merchant: str, category: str, amount: float) -> dict:
    prompt = f"""Analyze this purchase for financial irresponsibility.
Merchant: {merchant}
Category: {category}
Amount: ${amount}

Flag if: gambling, adult content, predatory lending, or excessive frivolous spending.
Respond in JSON: {{"flagged": true/false, "reason": "brief explanation"}}"""

    response = requests.post("http://localhost:11434/api/generate", json={
        "model": "phi3",
        "prompt": prompt,
        "stream": False
    }, timeout=10)
    return parse_response(response.json()["response"])
```

**Classification Flow:**
```
Transaction In → Rule-Based Check → Flagged? → YES → Save + Alert
                                  ↓
                                  NO
                                  ↓
                          Amount > $50? → NO → Save (not flagged)
                                  ↓
                                 YES
                                  ↓
                          Ollama installed? → NO → Save (not flagged)
                                  ↓
                                 YES
                                  ↓
                          Ollama Check → Flagged? → Save + Alert (if yes)
```

---

## Messaging / Alert System

### Primary: Email (Free)
- SMTP with Gmail App Password or SendGrid free tier (100/day)
- Sends HTML email with transaction details and warning

```python
# Email alert example
def send_email_alert(user_email: str, transaction: Transaction):
    subject = "🚨 Bank Spank Alert: Suspicious Purchase Detected"
    body = f"""
    We flagged a purchase on your account:

    Merchant: {transaction.merchant}
    Amount: ${transaction.amount}
    Reason: {transaction.flag_reason}

    Your card has been automatically locked.
    Log in to review and unlock if this was intentional.
    """
    # Send via SMTP/SendGrid
```

### Secondary: Mock SMS (Demo Mode)
- Logs SMS to console instead of actually sending
- Can swap to real Twilio with one config change

```python
def send_sms_alert(phone: str, message: str):
    if settings.SMS_MODE == "mock":
        logger.info(f"[MOCK SMS to {phone}]: {message}")
    else:
        # Real Twilio integration
        twilio_client.messages.create(to=phone, body=message)
```

### Alert Triggers
1. **Flagged purchase** → Email + SMS
2. **Card auto-locked** → Email notification
3. **Large purchase** (> $500) → Email warning (even if not flagged)

---

## Project Structure

```
Bank/
├── src/                        # React frontend
│   ├── main.jsx
│   ├── App.jsx
│   ├── index.css
│   ├── pages/
│   │   ├── Landing.jsx
│   │   ├── Login.jsx
│   │   ├── Register.jsx
│   │   └── Dashboard.jsx
│   ├── components/
│   │   ├── Navbar.jsx
│   │   ├── TransactionList.jsx
│   │   ├── CardStatus.jsx
│   │   ├── AlertsFeed.jsx
│   │   └── AuthForm.jsx
│   ├── hooks/
│   │   └── useAuth.js
│   ├── api/
│   │   └── client.js           # Axios/fetch wrapper
│   └── context/
│       └── AuthContext.jsx
│
├── backend/                    # Python FastAPI
│   ├── main.py                 # FastAPI app entry
│   ├── requirements.txt
│   ├── config.py               # Environment config
│   ├── database.py             # SQLAlchemy setup
│   ├── models/
│   │   ├── user.py
│   │   ├── transaction.py
│   │   └── alert.py
│   ├── routers/
│   │   ├── auth.py
│   │   ├── transactions.py
│   │   └── card.py
│   ├── services/
│   │   ├── classifier.py       # AI classification logic
│   │   └── alerts.py           # Email/SMS sending
│   └── schemas/                # Pydantic models
│       ├── user.py
│       ├── transaction.py
│       └── auth.py
│
├── scripts/
│   └── simulator.py            # Transaction simulator
│
├── docker-compose.yml          # PostgreSQL container
├── .env.example
├── .env                        # Local config (gitignored)
└── README.md
```

---

## Implementation Order

1. **Backend Setup**
   - FastAPI scaffold with PostgreSQL
   - User model + auth endpoints
   - JWT authentication

2. **Frontend Auth**
   - React Router setup
   - Login/Register pages
   - Auth context + protected routes

3. **Transaction System**
   - Transaction model + endpoints
   - Simulator script
   - Dashboard transaction list

4. **AI Classification**
   - Implement classifier (rule-based first)
   - Flag transactions on ingest
   - Show flagged items in dashboard

5. **Alerts & Card Lock**
   - Alert model + sending service
   - Card lock toggle
   - Alerts feed in dashboard

6. **Landing Page**
   - Marketing/info page
   - Polish UI

---

## Decisions Made

| Decision | Choice |
|----------|--------|
| Classification | Hybrid: Rule-based + Ollama (optional) |
| Messaging | Email (real) + SMS (mock/console) |
| Flagged categories | Gambling, adult, payday loans, pawn shops, excessive luxury |
| Card lock behavior | Auto-lock on flagged purchase, manual unlock via dashboard |

---

## Environment Variables

```env
# .env.example
DATABASE_URL=postgresql://user:pass@localhost:5432/bankspank
JWT_SECRET=your-secret-key-here
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=60

# Email (pick one)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Optional: Twilio (for real SMS)
SMS_MODE=mock  # or "twilio"
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Optional: Ollama
OLLAMA_ENABLED=true
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=phi3
```

---

## Simulator Script

```python
# scripts/simulator.py
# Simulates bank transactions being pushed to the app

import requests
import random
import time

API_URL = "http://localhost:8000/api/transactions"
API_KEY = "simulator-secret-key"

MERCHANTS = [
    # Normal purchases
    {"merchant": "Walmart", "category": "groceries", "amount_range": (20, 150)},
    {"merchant": "Amazon", "category": "shopping", "amount_range": (15, 200)},
    {"merchant": "Shell Gas", "category": "fuel", "amount_range": (30, 80)},
    {"merchant": "Netflix", "category": "entertainment", "amount_range": (15, 20)},
    # Flaggable purchases
    {"merchant": "DraftKings", "category": "gambling", "amount_range": (50, 500)},
    {"merchant": "BetMGM Casino", "category": "gambling", "amount_range": (100, 1000)},
    {"merchant": "QuickCash Payday", "category": "financial", "amount_range": (200, 500)},
    {"merchant": "Lucky's Pawn Shop", "category": "pawn", "amount_range": (50, 300)},
]

def simulate_transaction(user_id: str):
    merchant_info = random.choice(MERCHANTS)
    amount = round(random.uniform(*merchant_info["amount_range"]), 2)

    response = requests.post(API_URL, json={
        "user_id": user_id,
        "merchant": merchant_info["merchant"],
        "category": merchant_info["category"],
        "amount": amount
    }, headers={"X-API-Key": API_KEY})

    print(f"Sent: {merchant_info['merchant']} - ${amount} -> {response.status_code}")

if __name__ == "__main__":
    USER_ID = "test-user-uuid"
    while True:
        simulate_transaction(USER_ID)
        time.sleep(random.randint(5, 15))  # Random delay between transactions
```

---

## Docker Compose (PostgreSQL)

```yaml
# docker-compose.yml
version: '3.8'

services:
  db:
    image: postgres:15-alpine
    container_name: bankspank-db
    environment:
      POSTGRES_USER: bankspank
      POSTGRES_PASSWORD: bankspank
      POSTGRES_DB: bankspank
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

---

## Quick Start Guide

```bash
# 1. Start PostgreSQL
docker-compose up -d

# 2. Setup backend
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
cp .env.example .env      # Edit with your settings
uvicorn main:app --reload

# 3. Setup frontend (new terminal)
npm install
npm run dev

# 4. (Optional) Setup Ollama for AI classification
curl -fsSL https://ollama.com/install.sh | sh
ollama pull phi3

# 5. Run simulator (new terminal)
cd scripts
python simulator.py
```

---

## Verification / Testing Plan

1. **Database**: `docker-compose up -d`, verify PostgreSQL is running on port 5432
2. **Backend**: Run `uvicorn main:app --reload`, visit `http://localhost:8000/docs` for Swagger UI
3. **Frontend**: Run `npm run dev`, verify landing page loads at `http://localhost:5173`
4. **Auth Flow**: Register a user, login, verify JWT is stored and dashboard loads
5. **Simulator**: Run `python scripts/simulator.py`, verify transactions POST successfully
6. **Classification**: Send a gambling transaction, verify it gets flagged in dashboard
7. **Alerts**: Check console for mock SMS, verify email sends (if SMTP configured)
8. **Card Lock**: Toggle lock in dashboard, verify state persists on page refresh

---

## AWS EC2 Deployment (Single Instance)

### Architecture
```
┌─────────────────────────────────────────────────────┐
│                 EC2 (t3.micro)                      │
│  ┌───────────────────────────────────────────────┐  │
│  │              Docker Compose                   │  │
│  │  ┌─────────┐  ┌─────────┐  ┌──────────────┐   │  │
│  │  │  Nginx  │─▶│ FastAPI │─▶│  PostgreSQL  │   │  │
│  │  │  :80    │  │  :8000  │  │    :5432     │   │  │
│  │  │  :443   │  └─────────┘  └──────────────┘   │  │
│  │  └─────────┘                                  │  │
│  │   (serves React build + proxies /api)         │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Production Docker Compose

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  db:
    image: postgres:15-alpine
    container_name: bankspank-db
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: bankspank
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

  backend:
    build: ./backend
    container_name: bankspank-api
    environment:
      DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@db:5432/bankspank
      JWT_SECRET: ${JWT_SECRET}
      OLLAMA_URL: http://host.docker.internal:11434
    depends_on:
      - db
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    container_name: bankspank-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./frontend-dist:/usr/share/nginx/html:ro
      - ./certbot/conf:/etc/letsencrypt:ro
      - ./certbot/www:/var/www/certbot:ro
    depends_on:
      - backend
    restart: unless-stopped

  certbot:
    image: certbot/certbot
    volumes:
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot

volumes:
  pgdata:
```

### Nginx Configuration

```nginx
# nginx/nginx.conf
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    server {
        listen 80;
        server_name your-domain.com;

        # Certbot challenge
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        # Redirect to HTTPS
        location / {
            return 301 https://$host$request_uri;
        }
    }

    server {
        listen 443 ssl;
        server_name your-domain.com;

        ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

        # React frontend
        location / {
            root /usr/share/nginx/html;
            index index.html;
            try_files $uri $uri/ /index.html;
        }

        # FastAPI backend
        location /api {
            proxy_pass http://backend:8000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

### Deployment Script

```bash
#!/bin/bash
# deploy.sh - Run on EC2 instance

set -e

# Pull latest code
cd /home/ubuntu/bankspank
git pull origin main

# Build frontend
cd frontend
npm ci
npm run build
cp -r dist ../frontend-dist

# Build and restart services
cd ..
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

echo "Deployed successfully!"
```

### EC2 Setup Commands

```bash
# 1. Launch EC2 (Ubuntu 22.04, t3.micro, open ports 22, 80, 443)

# 2. SSH in and install dependencies
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose git nodejs npm

# 3. Add user to docker group
sudo usermod -aG docker ubuntu
newgrp docker

# 4. Clone repo
git clone https://github.com/your-username/bankspank.git
cd bankspank

# 5. Create .env file
cp .env.example .env
nano .env  # Edit with production values

# 6. Build frontend
cd src && npm ci && npm run build && cd ..
mkdir -p frontend-dist && cp -r src/dist/* frontend-dist/

# 7. Get SSL certificate (replace with your domain)
docker-compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  -d your-domain.com

# 8. Start everything
docker-compose -f docker-compose.prod.yml up -d

# 9. (Optional) Install Ollama for AI classification
curl -fsSL https://ollama.com/install.sh | sh
ollama pull phi3
```

### Cost Estimate

| Resource | Spec | Monthly Cost |
|----------|------|--------------|
| EC2 | t3.micro (free tier) | $0-8 |
| EBS | 20GB gp3 | ~$2 |
| Domain | Route 53 | $0.50 |
| **Total** | | **~$3-11/mo** |

*Free tier eligible for first 12 months*

---

## Project Structure (Updated for Deployment)

```
Bank/
├── src/                        # React frontend (Vite)
├── backend/                    # FastAPI backend
│   ├── Dockerfile              # Backend container
│   └── ...
├── scripts/
│   └── simulator.py
├── nginx/
│   └── nginx.conf              # Production nginx config
├── docker-compose.yml          # Development (DB only)
├── docker-compose.prod.yml     # Production (all services)
├── deploy.sh                   # Deployment script
├── .env.example
└── SPEC.md
```

---

## Future Enhancements (Out of Scope for MVP)

- Accountability partners (share access with trusted person)
- Spending budgets and goals
- Weekly/monthly reports via email
- Mobile app (React Native)
- Real bank integration via Plaid
- Spending analytics and charts
