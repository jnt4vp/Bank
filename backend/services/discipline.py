from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.transaction import Transaction
from ..models.user import User


def calculate_discipline_score(*, total_transactions: int, flagged_transactions: int) -> int:
    if total_transactions <= 0:
        return 100
    flagged_ratio = max(0.0, min(1.0, flagged_transactions / total_transactions))
    return max(0, min(100, round(100 - (flagged_ratio * 100))))


def transaction_counts_toward_discipline_score(
    *,
    plaid_transaction_id: object | None,
    transaction_date: date | None,
    created_at: datetime,
    discipline_score_started_at: datetime,
) -> bool:
    """Whether a transaction should affect the discipline score window.

    Manual entries use ingestion ``created_at``. Plaid-sourced rows use the bank **posted
    date** when present so prior purchases (historical sync) do not move the score—only
    spending on or after the discipline window **calendar day**.
    """
    start = normalize_discipline_start(discipline_score_started_at)
    if plaid_transaction_id is None:
        ca = created_at
        if ca.tzinfo is None or ca.tzinfo.utcoffset(ca) is None:
            ca = ca.replace(tzinfo=timezone.utc)
        else:
            ca = ca.astimezone(timezone.utc)
        return ca >= start

    if transaction_date is not None:
        return transaction_date >= start.date()

    ca = created_at
    if ca.tzinfo is None or ca.tzinfo.utcoffset(ca) is None:
        ca = ca.replace(tzinfo=timezone.utc)
    else:
        ca = ca.astimezone(timezone.utc)
    return ca >= start


def normalize_discipline_start(value: datetime) -> datetime:
    """Coerce user.started_at to UTC-aware for comparison with Transaction.created_at."""
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def resolve_discipline_score_cutoff_after_bank_sync(
    *,
    clock_now: datetime,
    max_transaction_created_at: datetime | None,
) -> datetime:
    """Compute discipline window cutoff right after a Plaid sync completes.

    Uses wall-clock ``clock_now``. If the latest transaction ``created_at`` is still
    at or after that instant (same microsecond batch), bump to ``max + 1µs`` so the
    just-imported rows stay **outside** the window. Only transactions ingested on later
    syncs count — whether the ledger was empty or already had rows before this sync.

    Call only when ``user.discipline_score_started_at`` is still ``NULL``; once set,
    a second bank link must not reset it.
    """
    cutoff = normalize_discipline_start(clock_now)
    if max_transaction_created_at is None:
        return cutoff
    mx = normalize_discipline_start(max_transaction_created_at)
    if mx >= cutoff:
        return mx + timedelta(microseconds=1)
    return cutoff


async def count_transactions_for_discipline_score(
    db: AsyncSession,
    *,
    user_id: UUID,
    discipline_score_started_at: datetime | None,
) -> tuple[int, int]:
    """
    Count transactions that count toward discipline score.

    Manual purchases: ``created_at >= discipline_score_started_at``.
    Plaid purchases: use bank **posted date** when set—only spending on or after the
    discipline window calendar day counts, so earlier bank history does not drag the score.

    When ``discipline_score_started_at`` is None, scoring has not started (neutral 100).
    """
    if discipline_score_started_at is None:
        return 0, 0
    start = normalize_discipline_start(discipline_score_started_at)
    start_day = start.date()

    # Manual / non-Plaid: ingestion time defines membership in the window.
    manual_window = and_(
        Transaction.plaid_transaction_id.is_(None),
        Transaction.created_at >= start,
    )
    # Plaid with posted date: compare calendar dates so prior bank purchases excluded.
    plaid_dated = and_(
        Transaction.plaid_transaction_id.is_not(None),
        Transaction.date.is_not(None),
        Transaction.date >= start_day,
    )
    # Plaid missing posted date (edge): fall back to ingestion time.
    plaid_no_date = and_(
        Transaction.plaid_transaction_id.is_not(None),
        Transaction.date.is_(None),
        Transaction.created_at >= start,
    )

    window = (Transaction.user_id == user_id) & (
        manual_window | plaid_dated | plaid_no_date
    )

    total_result = await db.execute(select(func.count(Transaction.id)).where(window))
    flagged_result = await db.execute(
        select(func.count(Transaction.id)).where(window & (Transaction.flagged.is_(True)))
    )
    total = int(total_result.scalar_one() or 0)
    flagged = int(flagged_result.scalar_one() or 0)
    return total, flagged


async def ensure_discipline_window_after_plaid_sync(
    db: AsyncSession,
    user_id: UUID,
) -> None:
    """Set discipline baseline after bank link + sync when the window is still unset."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or user.discipline_score_started_at is not None:
        return
    if user.bank_connected_at is None:
        return

    max_result = await db.execute(
        select(func.max(Transaction.created_at)).where(Transaction.user_id == user_id)
    )
    max_ca = max_result.scalar_one()

    cutoff = resolve_discipline_score_cutoff_after_bank_sync(
        clock_now=datetime.now(timezone.utc),
        max_transaction_created_at=max_ca,
    )
    user.discipline_score_started_at = cutoff


async def ensure_discipline_window_after_manual_transaction(
    db: AsyncSession,
    user_id: UUID,
    txn: Transaction,
) -> None:
    """Manual API ingest can open the window only after the user has linked a bank."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or user.bank_connected_at is None:
        return
    if user.discipline_score_started_at is not None:
        return
    user.discipline_score_started_at = txn.created_at
