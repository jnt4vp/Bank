"""
Demo-only savings transfers: no linked savings account or external provider.

When a purchase is flagged and matches a pact, if that pact has
`discipline_savings_percentage > 0`, we record a transfer for that % of the
purchase amount. Alert style (email / friend / etc.) does not gate savings—the
percentage field means “move this share to savings on violation.”
"""

from __future__ import annotations

import logging
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..config import get_settings
from ..models.pact import Pact
from ..models.simulated_savings_transfer import SimulatedSavingsTransfer
from ..models.transaction import Transaction

logger = logging.getLogger("bank.simulated_savings")


def _norm(value: str | None) -> str:
    return (value or "").strip().lower()


def _transaction_matches_pact(txn: Transaction, pact: Pact) -> bool:
    tx_cat = _norm(txn.category)
    tx_merchant = _norm(txn.merchant)
    tx_desc = _norm(txn.description)
    pact_cat = _norm(pact.custom_category or pact.category or pact.preset_category)
    if not pact_cat:
        return False
    return (
        pact_cat in tx_cat
        or tx_cat in pact_cat
        or pact_cat in tx_merchant
        or pact_cat in tx_desc
    )


def _savings_base_amount(txn: Transaction) -> float:
    raw = float(txn.amount)
    return abs(raw)


def _round_currency(value: float) -> float:
    d = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return float(d)


async def record_simulated_savings_transfers_for_transaction(
    db: AsyncSession,
    *,
    user_id: UUID,
    transaction: Transaction,
    skip_for_initial_plaid_backfill: bool = False,
) -> int:
    """
    Insert SimulatedSavingsTransfer rows for this txn when rules match.
    Returns count of new rows inserted.
    """
    settings = get_settings()
    if not settings.SIMULATED_TRANSFERS_ENABLED:
        return 0
    if skip_for_initial_plaid_backfill:
        return 0
    if not transaction.flagged:
        return 0

    result = await db.execute(
        select(Pact)
        .options(selectinload(Pact.accountability_settings))
        .where(
            Pact.user_id == user_id,
            func.lower(Pact.status) == "active",
        )
    )
    pacts = list(result.scalars().unique().all())

    base = _savings_base_amount(transaction)
    inserted = 0

    for pact in pacts:
        acc = pact.accountability_settings
        if acc is None:
            continue
        percent = float(acc.discipline_savings_percentage or 0)
        if percent <= 0:
            continue
        if not _transaction_matches_pact(transaction, pact):
            continue

        dup = await db.execute(
            select(SimulatedSavingsTransfer.id).where(
                SimulatedSavingsTransfer.source_transaction_id == transaction.id,
                SimulatedSavingsTransfer.pact_id == pact.id,
            )
        )
        if dup.scalar_one_or_none():
            continue

        contribution = _round_currency(base * (percent / 100.0))
        if contribution <= 0:
            continue

        row = SimulatedSavingsTransfer(
            user_id=user_id,
            source_transaction_id=transaction.id,
            pact_id=pact.id,
            amount=contribution,
            status="completed",
            transfer_type="simulated",
        )
        db.add(row)
        inserted += 1
        logger.info(
            "Simulated savings transfer (demo) | user=%s txn=%s pact=%s amount=%.2f",
            user_id,
            transaction.id,
            pact.id,
            contribution,
        )

    if inserted:
        await db.flush()

    return inserted


async def list_simulated_transfers_for_user(
    db: AsyncSession,
    user_id: UUID,
    *,
    limit: int = 200,
) -> list[SimulatedSavingsTransfer]:
    q = (
        select(SimulatedSavingsTransfer)
        .where(SimulatedSavingsTransfer.user_id == user_id)
        .order_by(SimulatedSavingsTransfer.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(q)
    return list(result.scalars().all())


async def backfill_simulated_savings_for_user(db: AsyncSession, *, user_id: UUID) -> int:
    """
    Create missing SimulatedSavingsTransfer rows for historical flagged transactions.
    Call after the user saves savings % accountability so the ledger catches up.
    """
    if not get_settings().SIMULATED_TRANSFERS_ENABLED:
        return 0

    result = await db.execute(
        select(Transaction)
        .where(
            Transaction.user_id == user_id,
            Transaction.flagged.is_(True),
        )
        .order_by(Transaction.created_at.asc())
    )
    txns = list(result.scalars().all())
    inserted_total = 0
    for txn in txns:
        inserted_total += await record_simulated_savings_transfers_for_transaction(
            db,
            user_id=user_id,
            transaction=txn,
            skip_for_initial_plaid_backfill=False,
        )
    return inserted_total
