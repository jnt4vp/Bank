# Discipline score time window

## Cutoff

Each user has optional `users.discipline_score_started_at` (UTC `timestamptz`). A transaction counts toward the discipline score **only if** `transactions.created_at >= discipline_score_started_at`.

- **`bank_connected_at`** records the first successful Plaid public-token exchange. Nothing is scored until that exists; `_touch_bank_connected_at` sets it at link time.
- The discipline window opens on the **first successful Plaid sync** after bank link while `discipline_score_started_at` is still `NULL` — including when the user already had manual or other rows in `transactions`. The cutoff is the **wall-clock completion** of that sync (`datetime.now(UTC)`), aligned with `max(created_at)` so the current import batch stays **out** of the window when timestamps collide (same rule as an empty ledger: bump to `max(created_at) + 1µs` when needed).
- **Second (or later) bank / later syncs:** once `discipline_score_started_at` is set, it is **not** changed by further syncs.
- When `discipline_score_started_at` is **NULL**, aggregates return zero rows → neutral score **100** until the window opens.
- **Manual** `POST /api/transactions` may set the cutoff only if `bank_connected_at` is set and the window is still unset (edge case if sync never opened it).
- Formula: `T` = in-window count, `F` = flagged count → `100` if `T == 0`, else `round(100 - (F/T)*100)` clamped 0–100.

## Transactions list vs score

`GET /api/transactions/` returns **all** transactions for the user by default. Optional query: `?flagged_only=true` filters server-side. Historical rows remain visible everywhere; only the score aggregates use the cutoff.

## Migrations

- `20260407_0019` — added `discipline_score_started_at`.
- `20260407_0020` — nullable default for new users.
- `20260407_0021` — `bank_connected_at`; backfill from `plaid_items`; users **with** Plaid get `discipline_score_started_at = now()` at migration (historical imports before that moment); users **without** Plaid get `NULL`.

## Reset

`PATCH /api/auth/me` with `{ "reset_discipline_window": true }` sets the cutoff to **now**, recomputes `discipline_score`, and does not delete transactions.

## UI

Dashboard theme uses `discipline_score_started_at` to **window** transactions for score/theming only; spending breakdowns and `/transactions` use the full list.
