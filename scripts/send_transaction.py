#!/usr/bin/env python3
"""Send a transaction to the Bank API.

Usage:
    # Send a single random transaction
    python scripts/send_transaction.py --email test@example.com --password password123

    # Send a specific transaction
    python scripts/send_transaction.py --email test@example.com --password password123 --merchant "DraftKings" --desc "Weekly sports bet" --amount 250

    # Send N random transactions
    python scripts/send_transaction.py --email test@example.com --password password123 --count 5

    # Target a different host
    python scripts/send_transaction.py --url http://your-server:8000/api/transactions --email test@example.com --password password123
"""

import argparse
import random
from urllib.parse import urlsplit, urlunsplit

import requests

# DEFAULT_URL = "http://3.138.139.3:8000/api/transactions"
DEFAULT_URL = "http://localhost:8000/api/transactions"

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
        resp = requests.post(
            login_url,
            json={"email": email, "password": password},
            timeout=10,
        )
    except requests.ConnectionError:
        raise SystemExit(f"Could not connect to login endpoint: {login_url}") from None

    if not resp.ok:
        raise SystemExit(f"Login failed ({resp.status_code}): {resp.text}")

    data = resp.json()
    token = data.get("access_token")
    if not token:
        raise SystemExit("Login succeeded but no access_token was returned.")

    return token


def send(url: str, token: str, merchant: str, description: str, amount: float):
    payload = {
        "merchant": merchant,
        "description": description,
        "amount": amount,
    }
    print(f"Sending: {merchant} | ${amount:.2f} | \"{description}\"")
    try:
        resp = requests.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        if resp.ok:
            data = resp.json()
            print(f"  -> Stored for user {data['user_id']} (id={data['id'][:8]}...)")
        else:
            print(f"  -> FAILED {resp.status_code}: {resp.text}")
    except requests.ConnectionError:
        print(f"  -> ERROR: Could not connect to {url}")


def main():
    parser = argparse.ArgumentParser(description="Send transactions to the Bank API")
    parser.add_argument("--url", default=DEFAULT_URL, help="API endpoint URL")
    parser.add_argument("--login-url", help="Auth login URL (defaults to /api/auth/login on the same host)")
    parser.add_argument("--email", help="User email to authenticate as")
    parser.add_argument("--password", help="User password for authentication")
    parser.add_argument("--token", help="Bearer token to use directly instead of logging in")
    parser.add_argument("--merchant", help="Merchant name (random if omitted)")
    parser.add_argument("--desc", help="Short description of the purchase")
    parser.add_argument("--amount", type=float, help="Amount (random if omitted)")
    parser.add_argument("--count", type=int, default=1, help="Number of random transactions to send")
    args = parser.parse_args()

    if args.token:
        token = args.token
    else:
        if not args.email or not args.password:
            parser.error("provide either --token or both --email and --password")
        token = authenticate(args.login_url or build_login_url(args.url), args.email, args.password)

    if args.merchant:
        send(args.url, token, args.merchant, args.desc or "Purchase", args.amount or 99.99)
    else:
        for i in range(args.count):
            txn = random_transaction()
            send(args.url, token, txn["merchant"], txn["description"], txn["amount"])
            if args.count > 1 and i < args.count - 1:
                print()


if __name__ == "__main__":
    main()
