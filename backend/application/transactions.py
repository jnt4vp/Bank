from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from ..models.transaction import Transaction
from ..ports.classifier import ClassifierPort
from ..ports.notifier import NotifierPort
from ..repositories.transactions import create_transaction
from ..services.classifier import classify_transaction

logger = logging.getLogger("bank.transactions")


async def ingest_user_transaction(
    db: AsyncSession,
    *,
    user_id: UUID,
    user_email: str | None,
    merchant: str,
    description: str,
    amount: float,
    classifier: ClassifierPort,
    notifier: NotifierPort,
) -> Transaction:
    classification = await classify_transaction(
        classifier,
        merchant=merchant,
        description=description,
        amount=amount,
    )

    txn = await create_transaction(
        db,
        user_id=user_id,
        merchant=merchant,
        description=description,
        amount=amount,
        category=classification.category,
        flagged=classification.flagged,
        flag_reason=classification.flag_reason,
    )

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await db.refresh(txn)

    logger.info(
        "NEW TRANSACTION  |  %s  |  %s  |  $%.2f  |  \"%s\"  |  id=%s  |  flagged=%s",
        txn.merchant,
        txn.user_id,
        float(txn.amount),
        txn.description,
        txn.id,
        txn.flagged,
    )

    if txn.flagged:
        await notifier.send_transaction_alert(
            to_email=user_email,
            merchant=txn.merchant,
            amount=float(txn.amount),
            category=txn.category,
            flag_reason=txn.flag_reason,
        )

    return txn
