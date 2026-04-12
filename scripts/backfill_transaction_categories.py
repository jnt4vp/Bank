#!/usr/bin/env python3
"""Backfill `category` on Plaid-sourced rows that are still NULL or empty.

Uses the same merchant/description heuristics as live sync (no extra Plaid API calls).
Run once after deploying improved categorization, or any time you want to clean history.

Examples:
  python scripts/backfill_transaction_categories.py --dry-run
  python scripts/backfill_transaction_categories.py --limit 500
  python scripts/backfill_transaction_categories.py --user-id 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from uuid import UUID

from sqlalchemy import or_, select

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.database import async_session
from backend.models.transaction import Transaction
from backend.services.plaid_category_resolution import infer_category_from_local_fields


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Backfill transaction.category from merchant/description heuristics."
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned updates only; do not commit.",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Max rows to process (0 = no limit).",
    )
    p.add_argument(
        "--user-id",
        type=str,
        default="",
        help="Only transactions for this user UUID.",
    )
    return p.parse_args()


async def run(args: argparse.Namespace) -> None:
    async with async_session() as session:
        q = select(Transaction).where(
            Transaction.plaid_transaction_id.isnot(None),
            or_(Transaction.category.is_(None), Transaction.category == ""),
        )
        if args.user_id.strip():
            q = q.where(Transaction.user_id == UUID(args.user_id.strip()))
        if args.limit and args.limit > 0:
            q = q.limit(args.limit)

        result = await session.execute(q)
        rows = result.scalars().all()

        updated = 0
        no_match = 0
        for row in rows:
            cat = infer_category_from_local_fields(
                row.merchant or "",
                row.description or "",
                row.plaid_original_description,
            )
            if not cat:
                no_match += 1
                continue
            if args.dry_run:
                print(f"[dry-run] {row.id} -> {cat} | {row.merchant!r}")
            else:
                row.category = cat
            updated += 1

        if not args.dry_run and updated:
            await session.commit()
        else:
            await session.rollback()

        print(
            f"Rows scanned: {len(rows)} | "
            f"{'Would update' if args.dry_run else 'Updated'}: {updated} | "
            f"No heuristic match: {no_match}"
        )


def main() -> None:
    args = parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
