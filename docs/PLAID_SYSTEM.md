# Plaid System

## What It Does

This app has two ways to create rows in `transactions`:

1. Manual ingestion through `POST /api/transactions`
2. Bank sync through Plaid

Both paths end up writing into the same `transactions` table, so the dashboard and transactions page read one combined ledger.

## Plaid Flow In This Repo

### 1. User starts Link

- The current frontend entry point is step 4 of registration in `frontend/src/pages/Register.jsx`.
- The frontend calls `POST /api/plaid/create-link-token`.
- `backend/routers/plaid.py` forwards that to `backend/services/plaid_service.py:create_link_token()`.
- The backend asks Plaid for a short-lived `link_token`.

### 2. User connects a bank

- Plaid Link returns a `public_token`.
- The frontend posts that token to `POST /api/plaid/exchange-token`.
- The backend exchanges it for a long-lived Plaid `access_token` and `item_id`.
- The `access_token` is encrypted before storage.
- A `plaid_items` row is created or updated for that user.

### 3. Accounts are synced

- After exchange, the backend calls Plaid `/accounts/get`.
- Each account is upserted into the `accounts` table.
- `accounts` rows belong to both a `plaid_item` and a `user`.

### 4. Transactions are synced

- The backend then runs Plaid `/transactions/sync`.
- New Plaid transactions are inserted into `transactions`.
- Modified Plaid transactions update the existing row.
- Removed Plaid transactions are deleted from the local table.
- The sync cursor is stored on `plaid_items.transaction_cursor`.

### 5. Background polling keeps data fresh

- `backend/services/plaid_poller.py` runs a background loop.
- Every `PLAID_POLL_INTERVAL_MINUTES`, it calls `sync_all_items()`.
- Each Plaid item syncs in its own DB session, so one failure does not stop the rest.

## Data Model

### `plaid_items`

Stores one connected Plaid item per linked institution/login.

Important fields:

- `item_id`: Plaid item identifier
- `access_token`: encrypted Plaid access token
- `transaction_cursor`: last Plaid sync cursor
- `last_synced_at`: last completed sync time

### `accounts`

Stores Plaid accounts for a linked item.

Important fields:

- `plaid_item_id`
- `plaid_account_id`
- `name`, `official_name`, `type`, `subtype`
- `current_balance`, `available_balance`

### `transactions`

Stores both manual and Plaid-backed transactions.

Plaid-backed rows have:

- `plaid_transaction_id`
- `account_id`
- `date`
- `pending`

Manual rows leave those fields `NULL` or defaulted.

## Classification And Alerts

- New manual transactions go through `backend/application/transactions.py`.
- New Plaid transactions go through `backend/services/plaid_service.py`.
- Both paths call the same classifier logic in `backend/services/classifier.py`.
- Flagged transactions can trigger email alerts.
- Initial Plaid backfill is stored and classified, but alerts are suppressed so a first-time bank connection does not spam old alerts.

## How To Add A Transaction

### Option 1: Add a manual transaction

Use the authenticated API:

```bash
curl -X POST http://localhost:8000/api/transactions/ \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "merchant": "Starbucks",
    "description": "Coffee before work",
    "amount": 6.75
  }'
```

What happens:

- The router calls `ingest_user_transaction()`
- The classifier runs
- A row is inserted into `transactions`
- If flagged, a notification can be sent

Use this path when you want to add a transaction yourself or seed/test the system without Plaid.

### Option 2: Add transactions through Plaid

Use the Plaid flow instead of creating rows directly:

1. Create a link token: `POST /api/plaid/create-link-token`
2. Complete Plaid Link in the client
3. Exchange the `public_token`: `POST /api/plaid/exchange-token`
4. Let the initial sync and poller write rows into `transactions`

You can also force a sync for one connected item:

```bash
curl -X POST http://localhost:8000/api/plaid/sync/<item_id> \
  -H "Authorization: Bearer <access_token>"
```

Use this path when the transaction should come from a real linked bank account.

## Config You Need

In `.env`:

```bash
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox
PLAID_POLL_INTERVAL_MINUTES=30
PLAID_TOKEN_KEY=
```

Notes:

- `PLAID_TOKEN_KEY` is optional but recommended. If empty, token encryption falls back to `JWT_SECRET`.
- The current code is wired for `sandbox` and `production`.

## Current Structural Notes

- The backend layering is mostly clean: router -> service/application -> repository/model.
- Plaid sync currently lives in `services/`, while manual transaction ingestion lives in `application/`.
- That means transaction ingestion logic is split across two paths. They share classifier code, but persistence and alert behavior are still implemented separately.
- The frontend currently exposes Plaid connection during registration, while list/sync/remove APIs exist mostly for backend/manual use.
