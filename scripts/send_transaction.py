#!/usr/bin/env python3
"""Send a transaction to the Bank API.

Usage:
    # Send a single random transaction
    python scripts/send_transaction.py

    # Send a specific transaction
    python scripts/send_transaction.py --merchant "DraftKings" --desc "Weekly sports bet" --amount 250

    # Send N random transactions
    python scripts/send_transaction.py --count 5

    # Target a different host
    python scripts/send_transaction.py --url http://your-server:8000/api/transactions
"""

import argparse
import random

import requests

DEFAULT_URL = "http://localhost:8000/api/transactions"
DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"

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


def random_transaction() -> dict:
    m = random.choice(MERCHANTS)
    return {
        "merchant": m["merchant"],
        "description": m["desc"],
        "amount": round(random.uniform(*m["amount_range"]), 2),
    }


def send(url: str, user_id: str, merchant: str, description: str, amount: float):
    payload = {
        "user_id": user_id,
        "merchant": merchant,
        "description": description,
        "amount": amount,
    }
    print(f"Sending: {merchant} | ${amount:.2f} | \"{description}\"")
    try:
        resp = requests.post(url, json=payload, timeout=10)
        if resp.ok:
            data = resp.json()
            print(f"  -> Stored (id={data['id'][:8]}...)")
        else:
            print(f"  -> FAILED {resp.status_code}: {resp.text}")
    except requests.ConnectionError:
        print(f"  -> ERROR: Could not connect to {url}")


def main():
    parser = argparse.ArgumentParser(description="Send transactions to the Bank API")
    parser.add_argument("--url", default=DEFAULT_URL, help="API endpoint URL")
    parser.add_argument("--user-id", default=DEFAULT_USER_ID, help="User UUID")
    parser.add_argument("--merchant", help="Merchant name (random if omitted)")
    parser.add_argument("--desc", help="Short description of the purchase")
    parser.add_argument("--amount", type=float, help="Amount (random if omitted)")
    parser.add_argument("--count", type=int, default=1, help="Number of random transactions to send")
    args = parser.parse_args()

    if args.merchant:
        send(args.url, args.user_id, args.merchant, args.desc or "Purchase", args.amount or 99.99)
    else:
        for i in range(args.count):
            txn = random_transaction()
            send(args.url, args.user_id, txn["merchant"], txn["description"], txn["amount"])
            if args.count > 1 and i < args.count - 1:
                print()


if __name__ == "__main__":
    main()
