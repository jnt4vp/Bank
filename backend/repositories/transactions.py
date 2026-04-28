from uuid import UUID

from sqlalchemy import Date, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.transaction import Transaction


async def create_transaction(
    db: AsyncSession,
    *,
    user_id: UUID,
    merchant: str,
    description: str,
    amount: float,
    category: str | None = None,
    flagged: bool = False,
    flag_reason: str | None = None,
) -> Transaction:
    txn = Transaction(
        user_id=user_id,
        merchant=merchant,
        description=description,
        amount=amount,
        category=category,
        flagged=flagged,
        flag_reason=flag_reason,
    )
    db.add(txn)
    return txn


async def get_transactions_for_user(
    db: AsyncSession,
    user_id: UUID,
    *,
    flagged_only: bool = False,
    limit: int | None = None,
    offset: int = 0,
) -> list[Transaction]:
    q = select(Transaction).where(Transaction.user_id == user_id)
    if flagged_only:
        q = q.where(Transaction.flagged.is_(True))
    # Sort by bank posting date when present, else by ingest date, then by
    # created_at to break ties. Without the COALESCE, NULL `date` rows
    # (manual / API ingests) get shoved to the end and can be cut off by
    # the limit, hiding rows the user just added.
    q = q.order_by(
        func.coalesce(Transaction.date, cast(Transaction.created_at, Date)).desc(),
        Transaction.created_at.desc(),
    )
    if offset:
        q = q.offset(offset)
    if limit is not None:
        q = q.limit(limit)
    result = await db.execute(q)
    return list(result.scalars().all())
