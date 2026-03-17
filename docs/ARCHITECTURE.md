# Project Architecture

## Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        User Browser                              │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  Frontend  (React + Vite)                                        │
│  frontend/src/                                                   │
│                                                                  │
│  app/          ─ Shell, router, AuthProvider                     │
│  features/     ─ Auth, transactions, pacts, accountability,      │
│                  plaid (Plaid Link integration)                   │
│  lib/api/      ─ Shared fetch client                             │
│  pages/        ─ Page components                                 │
└──────────────────────────┬───────────────────────────────────────┘
                           │ HTTP  /api/*
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  Backend  (FastAPI + SQLAlchemy)                                  │
│  backend/                                                        │
│                                                                  │
│  routers/         ─ Thin HTTP handlers (auth, plaid, pacts, …)   │
│  application/     ─ Use-case orchestration                       │
│  services/        ─ Domain logic (auth, classifier, plaid sync,  │
│                     token encryption, background poller)          │
│  repositories/    ─ Database CRUD                                │
│  models/          ─ SQLAlchemy ORM models                        │
│  schemas/         ─ Pydantic request/response validation         │
│  security.py      ─ Password hashing, JWT create/decode          │
│  ports/           ─ Abstract interfaces (Protocol classes)       │
│  infrastructure/  ─ Concrete adapters (Ollama, SMTP)             │
│  dependencies/    ─ FastAPI DI wiring                            │
│  config.py        ─ Pydantic Settings from .env                  │
│  database.py      ─ Async engine + session factory               │
└───────┬──────────────┬──────────┬──────────┬─────────────────────┘
        │              │          │          │
        ▼              ▼          ▼          ▼
   ┌─────────┐  ┌───────────┐ ┌────────┐ ┌──────────┐
   │PostgreSQL│  │ Ollama API│ │ Gmail  │ │ Plaid API│
   │  (data)  │  │  (LLM)   │ │ SMTP   │ │ (banking)│
   └─────────┘  └───────────┘ └────────┘ └──────────┘
```

## Backend Layers

Requests flow top-down. Infrastructure implements the port interfaces.

```
  ┌─────────────────────────────────────────────────┐
  │  Routers  (HTTP in/out, status codes, auth dep) │
  └────────────────────┬────────────────────────────┘
                       │
  ┌────────────────────▼────────────────────────────┐
  │  Application  (use-case orchestration)          │
  │  register_account, login_account,               │
  │  ingest_user_transaction, send_password_reset   │
  └──────┬─────────────────┬────────────────────────┘
         │                 │
  ┌──────▼──────┐   ┌──────▼──────────────────────┐
  │  Services   │   │  Ports  (Protocol ABCs)      │
  │  auth logic │   │  ClassifierPort              │
  │  classifier │   │  NotifierPort                │
  │  plaid sync │   └──────▲──────────────────────┘
  │  plaid poll │          │ implements
  │  token enc  │   ┌──────┴──────────────────────┐
  │  rules      │   │  Infrastructure             │
  └──────┬──────┘   │  OllamaClassifierAdapter    │
         │          │  SmtpNotifier               │
  ┌──────▼──────┐   └─────────────────────────────┘
  │Repositories │
  │  users      │
  │  counter    │
  │  transactions│
  │  plaid_items│
  │  accounts   │
  └──────┬──────┘
         │
  ┌──────▼──────┐
  │   Models    │
  │  + Database │
  └─────────────┘
```

## Transaction Ingestion Flow

```
  Browser                   API                         Backend
  ───────                   ───                         ───────

  POST /api/transactions
  + Bearer token
         │
         ├──────────────► Validate JWT (get_current_user)
         │                     │
         │                     ▼
         │                ingest_user_transaction()
         │                     │
         │                     ├──► Rule-based keyword check
         │                     │         │
         │                     │    match found?
         │                     │    ├─ yes ──► return flagged result
         │                     │    └─ no  ──► call ClassifierPort
         │                     │                    │
         │                     │                    ▼
         │                     │              Ollama /api/generate
         │                     │                    │
         │                     │              ◄─────┘ result or None
         │                     │
         │                     ├──► create_transaction() ──► PostgreSQL
         │                     │
         │                     ├──► if flagged:
         │                     │       NotifierPort.send_transaction_alert()
         │                     │              │
         │                     │              ▼
         │                     │         Gmail SMTP
         │                     │
         │              ◄──────┘ TransactionResponse
         │
  ◄──────┘ JSON response
```

## Plaid Bank Sync Flow

```
  Browser               API                         Backend                  Plaid
  ───────               ───                         ───────                  ─────

  ── connect bank ──────┐
                        │
              POST /api/plaid/create-link-token ──► create_link_token()
                                                         │
                                                         ▼
                                                    Plaid /link/token/create
                         ◄─────────────────────────── link_token
              Open Plaid Link modal
              User selects bank
              Link returns public_token
                        │
              POST /api/plaid/exchange-token ──────► exchange_public_token()
                                                         │
                                                         ├──► Plaid /item/public_token/exchange
                                                         │         │
                                                         │    ◄────┘ access_token + item_id
                                                         │
                                                         ├──► encrypt_token(access_token)
                                                         ├──► upsert PlaidItem ──► PostgreSQL
                                                         ├──► _sync_accounts() ──► Plaid /accounts/get
                                                         │
                                                         ├──► sync_transactions() (initial)
                                                         │         │
                                                         │         ├──► Plaid /transactions/sync
                                                         │         ├──► classify each txn (ClassifierPort)
                                                         │         ├──► persist transactions ──► PostgreSQL
                                                         │         └──► alert if flagged (NotifierPort)
                                                         │
                         ◄─────────────────────────── PlaidItemResponse


  ── background poll ───┐  (every PLAID_POLL_INTERVAL_MINUTES, default 30)
                        │
              plaid_poller → sync_all_items()
                              │
                              ├──► for each PlaidItem (fresh DB session per item):
                              │       sync_transactions()
                              │         ├──► _sync_accounts() (refresh balances)
                              │         ├──► Plaid /transactions/sync (cursor-based)
                              │         ├──► classify + persist new transactions
                              │         ├──► update modified transactions
                              │         ├──► delete removed transactions
                              │         └──► alert on flagged transactions
                              │
                              └──► failures isolated per item, poller continues
```

## Auth + Session Flow

```
  Browser              AuthProvider           API                    Backend
  ───────              ────────────           ───                    ───────

  ── page load ──────────────┐
                             │
                   read session from localStorage
                             │
                   token found?
                   ├─ no  ──► show login
                   └─ yes ──► GET /api/auth/me ──────► validate JWT
                                                       load user
                              ◄──────────────────────── UserResponse
                              set session state


  ── login ──────────────────┐
                             │
                   POST /api/auth/login ─────────────► authenticate_user()
                                                       verify bcrypt hash
                                                       create JWT
                              ◄──────────────────────── access_token
                   GET /api/auth/me ─────────────────► return user
                              ◄──────────────────────── UserResponse
                   persist {token, user} to localStorage


  ── forgot password ────────┐
                             │
                   POST /api/auth/forgot-password ───► generate_reset_token()
                                                       store token on user row
                                                       NotifierPort.send_password_reset()
                                                              │
                                                              ▼
                                                         Gmail SMTP
                              ◄──────────────────────── 200 (always)


  ── reset password ─────────┐
                             │
                   POST /api/auth/reset-password ────► validate token + expiry
                                                       hash new password
                                                       clear reset token
                              ◄──────────────────────── 200
```

## API Endpoints

```
  Method   Path                        Auth    Description
  ──────   ────                        ────    ───────────
  POST     /api/auth/register           -      Create account, return JWT
  POST     /api/auth/login              -      Authenticate, return JWT
  GET      /api/auth/me                 ✓      Current user profile
  POST     /api/auth/forgot-password    -      Request password reset email
  POST     /api/auth/reset-password     -      Reset password with token

  GET      /api/counter                 -      Read counter value
  POST     /api/counter/increment       -      Increment counter

  POST     /api/transactions            ✓      Submit + auto-classify transaction
  GET      /api/transactions            ✓      List user's transactions

  POST     /api/plaid/create-link-token ✓      Generate Plaid Link token
  POST     /api/plaid/exchange-token    ✓      Exchange public token, create PlaidItem, initial sync
  GET      /api/plaid/items             ✓      List user's connected banks
  POST     /api/plaid/sync/{item_id}    ✓      Manual sync trigger for a bank
  DELETE   /api/plaid/items/{item_id}   ✓      Disconnect a bank

  GET      /health                      -      Health check
```

## Key Design Decisions

- **Ports & Adapters** — External services (Ollama, SMTP) are behind Protocol interfaces in `ports/`, with concrete implementations in `infrastructure/`. This makes use-case tests trivial to write with mock objects.
- **Application layer** — `application/` orchestrates multi-step flows (register + mint token, classify + persist + alert). Routers stay thin.
- **Centralized security** — `backend/security.py` is the single source for password hashing, validation, and JWT operations. No duplication.
- **Frontend API client** — `lib/api/client.js` handles fetch, auth headers, and error parsing. Feature modules (`features/auth/api.js`) call it with clean one-liners.
- **AuthProvider + context** — Session state managed in React context, not scattered `localStorage` calls. `ProtectedRoute` checks `isReady` to avoid flash-of-redirect.
- **Plaid sync-and-store** — Transactions are copied from Plaid into PostgreSQL via cursor-based `/transactions/sync`. This gives full offline query capability and lets the classifier/alerter pipeline run on each transaction at ingest time.
- **Background poller** — `plaid_poller.py` runs an `asyncio` task every N minutes (configurable via `PLAID_POLL_INTERVAL_MINUTES`). Each PlaidItem syncs in its own DB session so one failure doesn't break the cycle.
- **Token encryption at rest** — Plaid access tokens are Fernet-encrypted (AES-128-CBC + HMAC-SHA256) before storage. Decryption uses `PLAID_TOKEN_KEY` (falls back to `JWT_SECRET`).
- **Idempotent token exchange** — Re-linking an existing `item_id` updates the token instead of creating a duplicate row.
- **Non-blocking Plaid SDK** — All synchronous Plaid SDK calls are wrapped in `asyncio.to_thread()` so they don't block the FastAPI event loop.
