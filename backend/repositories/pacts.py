from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.pact import Pact


async def get_active_pact_categories(db: AsyncSession, user_id: UUID) -> list[str]:
    """Return the list of category strings for a user's active pacts."""
    result = await db.execute(
        select(Pact.category).where(
            Pact.user_id == user_id,
            Pact.status == "active",
        )
    )
    return list(result.scalars().all())
