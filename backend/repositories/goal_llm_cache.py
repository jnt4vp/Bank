from datetime import date
from uuid import UUID

import uuid

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.goal_llm_txn_cache import GoalLlmTxnCache


async def get_goal_llm_cache_entries(
    db: AsyncSession,
    *,
    user_id: UUID,
    period_start: date,
    period_end: date,
    transaction_ids: list[UUID],
) -> dict[UUID, tuple[str | None, str]]:
    """transaction_id → (resolved_goal_key, goals_fingerprint)."""
    if not transaction_ids:
        return {}

    q = select(
        GoalLlmTxnCache.transaction_id,
        GoalLlmTxnCache.resolved_goal_key,
        GoalLlmTxnCache.goals_fingerprint,
    ).where(
        GoalLlmTxnCache.user_id == user_id,
        GoalLlmTxnCache.period_start == period_start,
        GoalLlmTxnCache.period_end == period_end,
        GoalLlmTxnCache.transaction_id.in_(transaction_ids),
    )
    result = await db.execute(q)
    return {row[0]: (row[1], row[2] or "") for row in result.all()}


async def upsert_goal_llm_cache_rows(
    db: AsyncSession,
    *,
    user_id: UUID,
    period_start: date,
    period_end: date,
    goals_fingerprint: str,
    rows: list[tuple[UUID, str | None]],
) -> None:
    if not rows:
        return

    for txn_id, key in rows:
        stmt = (
            pg_insert(GoalLlmTxnCache)
            .values(
                id=uuid.uuid4(),
                user_id=user_id,
                transaction_id=txn_id,
                period_start=period_start,
                period_end=period_end,
                resolved_goal_key=key,
                goals_fingerprint=goals_fingerprint,
            )
            .on_conflict_do_update(
                constraint="uq_goal_llm_txn_cache_user_txn_period",
                set_={
                    "resolved_goal_key": key,
                    "goals_fingerprint": goals_fingerprint,
                },
            )
        )
        await db.execute(stmt)


async def delete_goal_llm_cache_for_user_period(
    db: AsyncSession,
    *,
    user_id: UUID,
    period_start: date,
    period_end: date,
) -> None:
    await db.execute(
        delete(GoalLlmTxnCache).where(
            GoalLlmTxnCache.user_id == user_id,
            GoalLlmTxnCache.period_start == period_start,
            GoalLlmTxnCache.period_end == period_end,
        )
    )
