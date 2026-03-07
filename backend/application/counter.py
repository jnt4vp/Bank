from __future__ import annotations

from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.counter import Counter
from ..repositories.counter import get_or_create_counter, increment_counter


async def get_counter_value(db: AsyncSession) -> Counter:
    counter = await get_or_create_counter(db)

    if inspect(counter).pending:
        await db.commit()
        await db.refresh(counter)

    return counter


async def increment_counter_value(db: AsyncSession) -> Counter:
    counter = await increment_counter(db)

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await db.refresh(counter)
    return counter
