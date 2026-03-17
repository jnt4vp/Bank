#!/usr/bin/env python3
"""Send a transaction to Bank.

By default this simulates a Plaid Sandbox transaction, then syncs it into the app.
That is closer to how a real user receives a transaction than posting directly to
`/api/transactions`.

Use `--manual` to keep the old direct-API behavior.

Examples:
    # Create one Plaid-backed transaction for an existing user
    python scripts/send_transaction.py --email test@example.com --desc "DraftKings" --amount 250

    # Create five random Plaid-backed transactions
    python scripts/send_transaction.py --email test@example.com --count 5

    # Fall back to the old direct POST /api/transactions flow
    python scripts/send_transaction.py --manual --email test@example.com --password password123 --merchant "DraftKings" --desc "Weekly sports bet" --amount 250
"""

from __future__ import annotations

import argparse
import asyncio
import json
import random
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import requests
from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.dependencies.integrations import get_notifier
from backend.database import async_session
from backend.models.plaid_item import PlaidItem
from backend.models.transaction import Transaction
from backend.repositories.users import get_user_by_email
from backend.services import plaid_service

DEFAULT_URL = "http://localhost:8000/api/transactions"
SCRIPT_SANDBOX_INSTITUTION = "Scripted Plaid Sandbox"
SCRIPT_SANDBOX_USERNAME = "user_transactions_dynamic"
SYNC_RETRY_ATTEMPTS = 6
SYNC_RETRY_DELAY_SECONDS = 2

MERCHANTS = [
    {"merchant": "Walmart", "desc": "Weekly grocery run", "amount_range": (20, 150)},
    {"merchant": "Amazon", "desc": "Ordered new headphones", "amount_range": (15, 200)},
    {"merchant": "Shell Gas", "desc": "Filled up the tank", "amount_range": (30, 80)},
    {"merchant": "Netflix", "desc": "Monthly subscription", "amount_range": (15, 20)},
    {"merchant": "Starbucks", "desc": "Morning coffee and pastry", "amount_range": (4, 12)},
    {"merchant": "DraftKings", "desc": "Placed bets on NFL games", "amount_range": (50, 500)},
    {"merchant": "BetMGM Casino", "desc": "Online blackjack session", "amount_range": (100, 1000)},
    {"merchant": "QuickCash Payday", "desc": "Short-term payday loan", "amount_range": (200, 500)},
    {"merchant": "Lucky's Pawn Shop", "desc": "Pawned old electronics", "amount_range": (50, 300)},
    {"merchant": "Gucci", "desc": "Designer belt purchase", "amount_range": (300, 800)},
    {"merchant": "Best Buy", "desc": "New 65 inch TV", "amount_range": (400, 1200)},
    {"merchant": "Costco", "desc": "Bulk household supplies", "amount_range": (80, 250)},
]


class NoopClassifier:
    async def classify_transaction(self, **_kwargs):
        return None


def random_manual_transaction() -> dict:
    merchant = random.choice(MERCHANTS)
    return {
        "merchant": merchant["merchant"],
        "description": merchant["desc"],
        "amount": round(random.uniform(*merchant["amount_range"]), 2),
    }


def random_plaid_transaction() -> dict:
    merchant = random.choice(MERCHANTS)
    return {
        "description": merchant["merchant"],
        "amount": round(random.uniform(*merchant["amount_range"]), 2),
    }


def build_login_url(transaction_url: str) -> str:
    parsed = urlsplit(transaction_url)
    path = parsed.path.rstrip("/")

    if path.endswith("/api/transactions"):
        path = f"{path[:-len('/api/transactions')]}/api/auth/login"
    else:
        path = "/api/auth/login"

    return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def authenticate(login_url: str, email: str, password: str) -> str:
    print(f"Authenticating as {email}...")
    try:
        response = requests.post(
            login_url,
            json={"email": email, "password": password},
            timeout=10,
        )
    except requests.ConnectionError:
        raise SystemExit(f"Could not connect to login endpoint: {login_url}") from None

    if not response.ok:
        raise SystemExit(f"Login failed ({response.status_code}): {response.text}")

    data = response.json()
    token = data.get("access_token")
    if not token:
        raise SystemExit("Login succeeded but no access_token was returned.")

    return token


def send_manual(url: str, token: str, merchant: str, description: str, amount: float) -> None:
    payload = {
        "merchant": merchant,
        "description": description,
        "amount": amount,
    }
    print(f"Sending manual transaction: {merchant} | ${amount:.2f} | \"{description}\"")
    try:
        response = requests.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
    except requests.ConnectionError:
        print(f"  -> ERROR: Could not connect to {url}")
        return

    if response.ok:
        data = response.json()
        print(f"  -> Stored for user {data['user_id']} (id={data['id'][:8]}...)")
        return

    print(f"  -> FAILED {response.status_code}: {response.text}")


def parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("date must be YYYY-MM-DD") from exc


def build_plaid_transaction(
    *,
    description: str,
    amount: float,
    transaction_date: date,
) -> dict:
    iso_date = transaction_date.isoformat()
    return {
        "amount": float(amount),
        "description": description,
        "date_transacted": iso_date,
        "date_posted": iso_date,
    }


async def _get_existing_transaction_ids(user_id) -> set:
    async with async_session() as session:
        result = await session.execute(
            select(Transaction.id).where(Transaction.user_id == user_id)
        )
        return {row[0] for row in result.all()}


async def _select_plaid_item_for_user(user_id) -> PlaidItem | None:
    async with async_session() as session:
        result = await session.execute(
            select(PlaidItem)
            .where(
                PlaidItem.user_id == user_id,
                PlaidItem.institution_name == SCRIPT_SANDBOX_INSTITUTION,
            )
            .order_by(PlaidItem.created_at.desc())
        )
        return result.scalars().first()


async def _ensure_plaid_item(user_id) -> PlaidItem:
    existing = await _select_plaid_item_for_user(user_id)
    if existing is not None:
        return existing

    async with async_session() as session:
        return await plaid_service.create_sandbox_item(
            session,
            user_id,
            institution_name=SCRIPT_SANDBOX_INSTITUTION,
            override_username=SCRIPT_SANDBOX_USERNAME,
            override_password="pass_good",
            days_requested=1,
        )


async def _prime_plaid_item_if_needed(plaid_item_id) -> None:
    async with async_session() as session:
        plaid_item = await session.get(PlaidItem, plaid_item_id)
        if plaid_item is None:
            raise SystemExit("Plaid item disappeared before priming sync.")
        if plaid_item.transaction_cursor or plaid_item.last_synced_at:
            return
        print("Priming the dedicated Plaid sandbox item with an initial refresh...")
        await plaid_service.refresh_transactions(plaid_item)

    for attempt in range(8):
        if attempt:
            await asyncio.sleep(SYNC_RETRY_DELAY_SECONDS)
        print(f"  prime sync attempt {attempt + 1}/8")
        counts = await _sync_plaid_item(plaid_item_id)
        if counts["added"] or counts["modified"] or counts["removed"]:
            return


async def _create_plaid_transactions(plaid_item_id, transactions: list[dict]) -> dict:
    async with async_session() as session:
        plaid_item = await session.get(PlaidItem, plaid_item_id)
        if plaid_item is None:
            raise SystemExit("Plaid item disappeared before sandbox transaction creation.")
        return await plaid_service.create_sandbox_transactions(
            plaid_item,
            transactions=transactions,
        )


async def _sync_plaid_item(plaid_item_id) -> dict:
    async with async_session() as session:
        plaid_item = await session.get(PlaidItem, plaid_item_id)
        if plaid_item is None:
            raise SystemExit("Plaid item disappeared before sync.")
        return await plaid_service.sync_transactions(
            session,
            plaid_item,
            classifier=NoopClassifier(),
            notifier=get_notifier(),
        )


async def _fetch_new_transactions(user_id, existing_ids: set) -> list[Transaction]:
    async with async_session() as session:
        result = await session.execute(
            select(Transaction)
            .where(Transaction.user_id == user_id)
            .order_by(Transaction.created_at.desc())
        )
        rows = list(result.scalars().all())
        return [row for row in rows if row.id not in existing_ids]


def _match_transactions(rows: list[Transaction], plaid_payload: list[dict]) -> list[Transaction]:
    plaid_descriptions = {txn["description"] for txn in plaid_payload}
    return [
        txn
        for txn in rows
        if txn.merchant in plaid_descriptions or txn.description in plaid_descriptions
    ]


async def run_plaid_mode(args: argparse.Namespace) -> None:
    if not args.email:
        raise SystemExit("--email is required in Plaid mode")
    if args.count < 1:
        raise SystemExit("--count must be at least 1")
    if args.merchant:
        raise SystemExit(
            "--merchant is only supported with --manual. "
            "Plaid mode only accepts --desc because Plaid sandbox transaction creation "
            "does not have a separate merchant field."
        )
    if not args.merchant and args.count > 10:
        raise SystemExit("Plaid sandbox transaction creation is limited to 10 transactions per call")

    async with async_session() as session:
        user = await get_user_by_email(session, args.email)
        if user is None:
            raise SystemExit(f"User not found: {args.email}")

    plaid_item = await _ensure_plaid_item(user.id)
    await _prime_plaid_item_if_needed(plaid_item.id)

    existing_ids = await _get_existing_transaction_ids(user.id)

    if args.desc:
        candidates = [{
            "description": args.desc,
            "amount": args.amount or 99.99,
        }]
    else:
        candidates = [random_plaid_transaction() for _ in range(args.count)]

    plaid_payload = [
        build_plaid_transaction(
            description=txn["description"],
            amount=txn["amount"],
            transaction_date=args.date,
        )
        for txn in candidates
    ]

    print(
        f"Creating {len(plaid_payload)} Plaid sandbox transaction(s) for {args.email} "
        f"through item {plaid_item.id}..."
    )
    for txn in candidates:
        print(f"  -> \"{txn['description']}\" | ${txn['amount']:.2f}")

    create_response = await _create_plaid_transactions(plaid_item.id, plaid_payload)
    counts = {"added": 0, "modified": 0, "removed": 0}
    new_rows: list[Transaction] = []
    matched_rows: list[Transaction] = []
    print("Waiting for Plaid to surface the new transaction through /transactions/sync...")
    for attempt in range(SYNC_RETRY_ATTEMPTS):
        if attempt:
            await asyncio.sleep(SYNC_RETRY_DELAY_SECONDS)
        counts = await _sync_plaid_item(plaid_item.id)
        new_rows = await _fetch_new_transactions(user.id, existing_ids)
        matched_rows = _match_transactions(new_rows, plaid_payload)
        print(
            f"  sync attempt {attempt + 1}/{SYNC_RETRY_ATTEMPTS}:"
            f" added={counts['added']}"
            f" modified={counts['modified']}"
            f" removed={counts['removed']}"
        )
        if matched_rows:
            break

    print(f"Plaid request_id: {create_response.get('request_id', 'unknown')}")
    print(
        "Sync result:"
        f" added={counts['added']}"
        f" modified={counts['modified']}"
        f" removed={counts['removed']}"
    )

    if matched_rows:
        new_rows = matched_rows
    elif not new_rows:
        print("No new local transactions were found after sync.")
        return

    print("Stored transactions:")
    for txn in new_rows:
        print(
            json.dumps(
                {
                    "id": str(txn.id),
                    "merchant": txn.merchant,
                    "description": txn.description,
                    "plaid_original_description": txn.plaid_original_description,
                    "amount": float(txn.amount),
                    "category": txn.category,
                    "flagged": txn.flagged,
                    "flag_reason": txn.flag_reason,
                    "date": txn.date.isoformat() if txn.date else None,
                    "pending": txn.pending,
                    "plaid_transaction_id": txn.plaid_transaction_id,
                },
                indent=2,
            )
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Send transactions to Bank")
    parser.add_argument("--email", help="User email")
    parser.add_argument("--password", help="User password (required only with --manual)")
    parser.add_argument("--merchant", help="Manual mode merchant name")
    parser.add_argument(
        "--desc",
        help="Plaid mode raw transaction text, or manual mode purchase description",
    )
    parser.add_argument("--amount", type=float, help="Amount (random if omitted)")
    parser.add_argument("--count", type=int, default=1, help="Number of random transactions to send")
    parser.add_argument(
        "--date",
        type=parse_date,
        default=date.today(),
        help="Transaction date for Plaid mode in YYYY-MM-DD format (defaults to today)",
    )
    parser.add_argument(
        "--manual",
        action="store_true",
        help="Use the old direct POST /api/transactions flow instead of Plaid",
    )
    parser.add_argument("--url", default=DEFAULT_URL, help="Manual mode API endpoint URL")
    parser.add_argument(
        "--login-url",
        help="Manual mode auth login URL (defaults to /api/auth/login on the same host)",
    )
    parser.add_argument(
        "--token",
        help="Manual mode Bearer token to use directly instead of logging in",
    )
    args = parser.parse_args()

    if args.manual:
        if args.token:
            token = args.token
        else:
            if not args.email or not args.password:
                parser.error("manual mode requires --token or both --email and --password")
            token = authenticate(
                args.login_url or build_login_url(args.url),
                args.email,
                args.password,
            )

        if args.merchant:
            send_manual(
                args.url,
                token,
                args.merchant,
                args.desc or "Purchase",
                args.amount or 99.99,
            )
            return

        for index in range(args.count):
            txn = random_manual_transaction()
            send_manual(
                args.url,
                token,
                txn["merchant"],
                txn["description"],
                txn["amount"],
            )
            if args.count > 1 and index < args.count - 1:
                print()
        return

    asyncio.run(run_plaid_mode(args))


if __name__ == "__main__":
    main()
