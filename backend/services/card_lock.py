from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import case, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models.user import User


def lock_duration() -> timedelta:
    return timedelta(minutes=get_settings().CARD_LOCK_DURATION_MINUTES)


async def extend_card_lock(
    db: AsyncSession,
    *,
    user_id: UUID,
    duration: timedelta | None = None,
) -> datetime:
    """
    Extend the user's card lock to max(card_locked_until, now() + duration).
    Returns the proposed `now() + duration` (the actual stored value may be a
    longer pre-existing lock). Re-flagging never shortens an active lock.
    """
    new_until = datetime.now(timezone.utc) + (duration or lock_duration())
    await db.execute(
        update(User)
        .where(User.id == user_id)
        .values(
            card_locked_until=case(
                (User.card_locked_until.is_(None), new_until),
                (User.card_locked_until > new_until, User.card_locked_until),
                else_=new_until,
            )
        )
    )
    return new_until
