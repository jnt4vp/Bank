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
) -> Transaction:
    txn = Transaction(
        user_id=user_id,
        merchant=merchant,
        description=description,
        amount=amount,
    )
    db.add(txn)
    await db.commit()
    await db.refresh(txn)
    return txn


async def get_all_transactions(db: AsyncSession) -> list[Transaction]:
    result = await db.execute(
        select(Transaction).order_by(Transaction.created_at.desc())
    )
    return list(result.scalars().all())
