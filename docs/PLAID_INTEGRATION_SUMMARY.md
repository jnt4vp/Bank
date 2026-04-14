# Plaid Integration Summary

This document is a concise implementation-focused overview of the current Plaid integration.

It covers:

- how the frontend and backend link a bank account
- which database models store Plaid data
- how transactions are categorized and flagged

For deeper design notes, see `docs/PLAID_SYSTEM.md` and `docs/ARCHITECTURE.md`.

## Integration Overview

The app uses Plaid Link to connect a user's bank account, stores the linked item and accounts locally, then pulls transactions into the local `transactions` table.

At a high level:

1. The frontend requests a Plaid `link_token`.
2. Plaid Link returns a `public_token`.
3. The backend exchanges the `public_token` for an `access_token` and `item_id`.
4. The backend stores the Plaid item, syncs account metadata, and attempts an initial transaction sync.
5. A background poller keeps syncing linked items on an interval.

## User-Facing Entry Points

The current frontend exposes Plaid in two places:

- Registration flow: `frontend/src/pages/Register.jsx`
- Dashboard reconnect/connect flow: `frontend/src/features/plaid/PlaidConnectButton.jsx`

The frontend API wrapper lives in:

- `frontend/src/features/plaid/api.js`

The main backend routes live in:

- `POST /api/plaid/create-link-token`
- `POST /api/plaid/exchange-token`
- `GET /api/plaid/items`
- `POST /api/plaid/sync/{item_id}`
- `DELETE /api/plaid/items/{item_id}`

## Backend Flow

### 1. Create Link Token

`create_link_token(user_id)` builds a Plaid Link token for the authenticated user.

Current configuration:

- product: `transactions`
- country: `US`
- language: `en`
- client name: `PactBank`

### 2. Exchange Public Token

`exchange_public_token(...)` does the following:

- exchanges the Plaid `public_token` for `access_token` and `item_id`
- upserts a `plaid_items` row
- encrypts the Plaid `access_token` before storage
- records `users.bank_connected_at` on first successful link
- fetches and upserts Plaid accounts into `accounts`

If the user reconnects an existing Plaid item, the stored token is updated.

### 3. Sync Transactions

`sync_transactions(...)` uses Plaid `/transactions/sync` and:

- pages through all available results using `next_cursor`
- inserts new Plaid transactions into `transactions`
- updates modified transactions
- deletes removed transactions
- stores the latest cursor on the Plaid item
- updates `last_synced_at`

The integration is pull-based. The app does not depend on incoming Plaid webhooks to function.

### 4. Background Poller

`backend/services/plaid_poller.py` starts a background loop at app startup.

Behavior:

- disabled when Plaid credentials are missing
- sleeps for `PLAID_POLL_INTERVAL_MINUTES`
- then syncs every stored `plaid_items` row
- uses a fresh DB session per item so one failure does not stop the full cycle

## Core Database Models

The Plaid integration is centered on three tables plus a small amount of related user and pact state.

### `plaid_items`

Represents one connected Plaid item.

Key fields:

- `id`: local UUID primary key
- `user_id`: owner of the item
- `item_id`: Plaid item identifier
- `access_token`: encrypted Plaid access token
- `institution_name`: optional display name from Plaid Link metadata
- `transaction_cursor`: last cursor returned by Plaid `/transactions/sync`
- `last_synced_at`: last successful sync time
- `created_at`: creation timestamp

Notes:

- `item_id` is unique
- the stored `access_token` is encrypted at write time and decrypted when used
- the service still tolerates legacy plaintext tokens during reads

### `accounts`

Stores bank accounts discovered under a Plaid item.

Key fields:

- `id`: local UUID primary key
- `plaid_item_id`: parent Plaid item
- `user_id`: owning user
- `plaid_account_id`: Plaid account identifier
- `name`, `official_name`
- `type`, `subtype`
- `mask`
- `current_balance`, `available_balance`
- `iso_currency_code`
- `created_at`, `updated_at`

Notes:

- `plaid_account_id` is unique
- accounts are refreshed during link and on every transaction sync
- deleting a `plaid_items` row cascades to its accounts

### `transactions`

Stores both manual and Plaid-sourced transactions.

Shared transaction fields:

- `id`
- `user_id`
- `merchant`
- `description`
- `amount`
- `category`
- `flagged`
- `flag_reason`
- `alert_sent`, `alert_sent_at`
- `accountability_alert_sent`, `accountability_alert_sent_at`
- `created_at`

Plaid-specific fields:

- `plaid_transaction_id`
- `plaid_original_description`
- `account_id`
- `date`
- `pending`

Notes:

- `plaid_transaction_id` is unique
- `NULL` Plaid fields mean the row was created manually, not imported from Plaid
- `account_id` points at the local `accounts` row, not directly to Plaid

### Related State Used by Plaid

Plaid flow also touches:

- `users.bank_connected_at`: set on first successful link
- active `pacts`: used as the category/flagging input set during classification

## Categorization and Flagging Workflow

Imported Plaid transactions are categorized during ingest inside `sync_transactions(...)`.

### Inputs Used for Classification

For each new Plaid transaction, the service builds:

- `merchant`: `merchant_name`, else `name`, else `"Unknown"`
- `description`: `name`, else original description
- `amount`
- `user_categories`: the user's active pact categories from `repositories/pacts.py`

### Default Category

Before custom classification runs, the service seeds `category` from Plaid metadata:

- `personal_finance_category.primary` when present
- otherwise the first legacy Plaid `category` entry

This means Plaid data provides a fallback category even when the app classifier does nothing.

### App-Specific Classification

The main categorization logic is in `backend/services/classifier.py`.

The workflow is:

1. Load the user's active pact categories.
2. Normalize them to lowercase.
3. Try rule-based keyword matching first.
4. If no keyword rule matches, call the configured classifier port.
5. Ignore LLM categories that are outside the user's active pact list.

### Rule-Based Matching

The classifier has built-in keyword sets for pact categories such as:

- gambling
- adult
- alcohol
- drugs
- dining out
- coffee shops
- online shopping
- entertainment
- ride share
- fast food
- convenience store

If a keyword match is found, the transaction is:

- `flagged = true`
- `category = matched pact category`
- `flag_reason = keyword-based explanation`

### LLM / Classifier Port Fallback

If rule-based matching does not decide the result, the service calls `ClassifierPort.classify_transaction(...)`.

The classifier result is only accepted when:

- it marks the transaction as flagged, and
- its category is inside the user's active pact categories

This keeps Plaid transaction flagging scoped to the categories the user has actually opted into.

## Alerts and Downstream Effects

For newly added Plaid transactions:

- flagged transactions can trigger email alerts
- flagged transactions can trigger accountability alerts
- simulated savings transfers may be recorded

Initial Plaid backfills intentionally suppress alerts so a first-time bank connection does not spam the user with historical notifications.

## Current Operational Behavior

The integration currently works in sandbox and eventually imports transactions after linking.

Important behavior to understand:

- immediate sync after `exchange-token` may return zero rows for a newly linked sandbox item
- the background poller is the recovery path when Plaid data is not ready on the first sync
- production Docker defaults still use `PLAID_ENV=sandbox` unless `.env.prod` overrides it

## Known Gaps

These are worth keeping in mind when working on or documenting the feature:

- modified Plaid transactions are updated in place, but they are not currently reclassified before alert logic runs
- the immediate post-link experience can look empty until the poller catches up
- the repo still contains demo/dev seed behavior for local-style startup flows

## Environment Variables

The main Plaid-related configuration lives in environment variables:

- `PLAID_CLIENT_ID`
- `PLAID_SECRET`
- `PLAID_ENV`
- `PLAID_POLL_INTERVAL_MINUTES`
- `PLAID_TOKEN_KEY`

Related notification config:

- `GMAIL_USER`
- `GMAIL_APP_PASSWORD`

## File Map

Useful implementation files:

- `backend/routers/plaid.py`
- `backend/services/plaid_service.py`
- `backend/services/plaid_poller.py`
- `backend/services/classifier.py`
- `backend/models/plaid_item.py`
- `backend/models/account.py`
- `backend/models/transaction.py`
- `frontend/src/features/plaid/api.js`
- `frontend/src/features/plaid/PlaidConnectButton.jsx`
- `frontend/src/pages/Register.jsx`
- `frontend/src/pages/Dashboard.jsx`
