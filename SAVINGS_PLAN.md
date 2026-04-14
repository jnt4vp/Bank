# "How Much You've Saved" Feature

## Concept
For each pact category, capture what the user **used to spend** (baseline), compare it to what they **currently spend**, and show the difference as real dollar savings.

## Step 1: Migration
Add two columns to `pacts`:
- `baseline_monthly_spend` — avg monthly spend in that category *before* the pact was created (computed from Plaid history)
- `baseline_created_at` — timestamp of when we snapshotted it

## Step 2: Baseline Calculation Service
New file `backend/services/baseline.py`:
- When a pact is created, query all transactions matching that category from **before** pact creation
- Compute the date range of those transactions, divide total spend by number of months to get avg monthly
- Store it on the pact row
- Also add a backfill function so existing pacts can get baselines retroactively

## Step 3: Hook Into Pact Creation
In `routers/pact.py` `create_pact` — after inserting the pact, call the baseline service to snapshot the number.

## Step 4: Savings Summary Endpoint
New endpoint `GET /api/pacts/savings-summary`:
- For each active pact with a baseline, get current month's spend in that category
- Return per-pact: `{ category, baseline_monthly, current_monthly, saved_monthly }`
- Return aggregate: `{ total_saved_monthly, total_saved_projected_yearly }`

## Step 5: Dashboard Frontend
Replace or augment the existing "Pact Savings" card:
- Show the aggregate number: **"You're saving $190/mo"**
- Below it: **"$2,280/yr at this pace"**
- Optionally show per-pact breakdown on hover or click

## Step 6: Backfill Existing Pacts
One-time script or endpoint to compute baselines for pacts that already exist, so users don't have to recreate them.

## What Already Exists That We Reuse
- Transaction history from Plaid (already stored)
- Pact-to-transaction category matching logic (already in `simulated_savings_transfers.py` and `Dashboard.jsx`)
- The "Pact Savings" card on the dashboard (we enhance it)

## Open Questions
1. **Lookback window** — how far back should baseline look? 90 days feels right (covers seasonal variation without going stale).
2. **Current spend window** — compare against current calendar month, or rolling 30 days?
3. **Where to show it** — just the dashboard card, or also on the Pacts page and Analytics page?
