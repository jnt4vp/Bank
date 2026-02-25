from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.counter import Counter


async def get_or_create_counter(db: AsyncSession) -> Counter:
    result = await db.execute(select(Counter).where(Counter.id == 1))
    counter = result.scalar_one_or_none()
    if counter is None:
        counter = Counter(id=1, value=0)
        db.add(counter)
        await db.commit()
        await db.refresh(counter)
    return counter


async def increment_counter(db: AsyncSession) -> Counter:
    counter = await get_or_create_counter(db)
    counter.value += 1
    await db.commit()
    await db.refresh(counter)
    return counter
