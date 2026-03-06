from uuid import UUID

from sqlalchemy import select
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
    await db.commit()
    await db.refresh(txn)
    return txn


async def get_transactions_for_user(db: AsyncSession, user_id: UUID) -> list[Transaction]:
    result = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == user_id)
        .order_by(Transaction.created_at.desc())
    )
    return list(result.scalars().all())
