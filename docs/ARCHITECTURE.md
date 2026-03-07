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
│  features/     ─ Auth API, session, context, transaction hooks   │
│  lib/api/      ─ Shared fetch client                             │
│  pages/        ─ Page components                                 │
└──────────────────────────┬───────────────────────────────────────┘
                           │ HTTP  /api/*
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  Backend  (FastAPI + SQLAlchemy)                                  │
│  backend/                                                        │
│                                                                  │
│  routers/         ─ Thin HTTP handlers                           │
│  application/     ─ Use-case orchestration                       │
│  services/        ─ Domain logic (auth, classifier rules)        │
│  repositories/    ─ Database CRUD                                │
│  models/          ─ SQLAlchemy ORM models                        │
│  schemas/         ─ Pydantic request/response validation         │
│  security.py      ─ Password hashing, JWT create/decode          │
│  ports/           ─ Abstract interfaces (Protocol classes)       │
│  infrastructure/  ─ Concrete adapters (Ollama, SMTP)             │
│  dependencies/    ─ FastAPI DI wiring                            │
│  config.py        ─ Pydantic Settings from .env                  │
│  database.py      ─ Async engine + session factory               │
└───────┬──────────────────┬───────────────────┬───────────────────┘
        │                  │                   │
        ▼                  ▼                   ▼
   ┌─────────┐      ┌───────────┐      ┌────────────┐
   │PostgreSQL│      │ Ollama API│      │ Gmail SMTP │
   │  (data)  │      │  (LLM)   │      │  (email)   │
   └─────────┘      └───────────┘      └────────────┘
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
  │  rules      │   └──────▲──────────────────────┘
  └──────┬──────┘          │ implements
         │          ┌──────┴──────────────────────┐
  ┌──────▼──────┐   │  Infrastructure             │
  │Repositories │   │  OllamaClassifierAdapter    │
  │  users      │   │  SmtpNotifier               │
  │  counter    │   └─────────────────────────────┘
  │  transactions│
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

  GET      /health                      -      Health check
```

## Key Design Decisions

- **Ports & Adapters** — External services (Ollama, SMTP) are behind Protocol interfaces in `ports/`, with concrete implementations in `infrastructure/`. This makes use-case tests trivial to write with mock objects.
- **Application layer** — `application/` orchestrates multi-step flows (register + mint token, classify + persist + alert). Routers stay thin.
- **Centralized security** — `backend/security.py` is the single source for password hashing, validation, and JWT operations. No duplication.
- **Frontend API client** — `lib/api/client.js` handles fetch, auth headers, and error parsing. Feature modules (`features/auth/api.js`) call it with clean one-liners.
- **AuthProvider + context** — Session state managed in React context, not scattered `localStorage` calls. `ProtectedRoute` checks `isReady` to avoid flash-of-redirect.
