import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models.transaction import Transaction
from ..ports.classifier import ClassifierPort
from ..ports.notifier import NotifierPort
from ..repositories.pacts import get_active_pact_categories
from ..repositories.transactions import create_transaction
from ..services.card_lock import extend_card_lock
from ..services.discipline import ensure_discipline_window_after_manual_transaction
from ..services.classifier import classify_transaction
from ..services.accountability_alerts import send_accountability_alerts_for_transaction
from ..services.simulated_savings_transfers import (
    record_simulated_savings_transfers_for_transaction,
)

logger = logging.getLogger("bank.transactions")


class CardLockedError(Exception):
    """Raised when a user tries to record a purchase while their card is locked."""


def _format_active_pacts(user_categories: list[str] | None) -> str:
    categories = [category.strip() for category in (user_categories or []) if category and category.strip()]
    return ", ".join(categories) if categories else "-"


def _format_ai_model() -> str:
    settings = get_settings()
    if not settings.OLLAMA_ENABLED:
        return "disabled"
    return f"ollama:{settings.OLLAMA_MODEL}@{settings.OLLAMA_URL}"


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
    card_locked_until: datetime | None = None,
    card_lock_auto_enabled: bool = True,
) -> Transaction:
    now = datetime.now(timezone.utc)
    if card_locked_until is not None and card_locked_until > now:
        logger.info(
            "BLOCKED PURCHASE  |  user=%s  |  merchant=%s  |  amount=$%.2f  |  locked_until=%s",
            user_id, merchant, amount, card_locked_until.isoformat(),
        )
        raise CardLockedError(
            f"Card is locked until {card_locked_until.isoformat()}."
        )

    user_categories = await get_active_pact_categories(db, user_id)
    logger.info(
        "CLASSIFICATION CHECK  |  user=%s  |  merchant=%s  |  description=%s  |  amount=$%.2f  |  active_pacts=%s  |  ai=%s",
        user_id,
        merchant,
        description,
        amount,
        _format_active_pacts(user_categories),
        _format_ai_model(),
    )

    classification = await classify_transaction(
        classifier,
        merchant=merchant,
        description=description,
        amount=amount,
        user_categories=user_categories or None,
    )
    logger.info(
        "CLASSIFICATION RESULT  |  flagged=%s  |  category=%s  |  reason=%s",
        classification.flagged,
        classification.category or "-",
        classification.flag_reason or "-",
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
    await db.flush()
    await ensure_discipline_window_after_manual_transaction(db, user_id, txn)

    # Auto-lock the card as punishment for breaking a pact. card_was_locked
    # flags are excluded so a locked-card purchase doesn't infinitely renew the lock.
    if (
        card_lock_auto_enabled
        and classification.flagged
        and classification.flag_reason != "card_was_locked"
    ):
        await extend_card_lock(db, user_id=user_id)

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await db.refresh(txn)

    # Demo: ledger savings moves without a real linked account (see SimulatedSavingsTransfer).
    await record_simulated_savings_transfers_for_transaction(
        db,
        user_id=user_id,
        transaction=txn,
        skip_for_initial_plaid_backfill=False,
    )

    logger.info(
        "ADDED TRANSACTION  |  merchant=%s  |  description=%s  |  amount=$%.2f  |  flagged=%s  |  category=%s  |  reason=%s  |  id=%s",
        txn.merchant,
        txn.description,
        float(txn.amount),
        txn.flagged,
        txn.category or "-",
        txn.flag_reason or "-",
        txn.id,
    )

    if txn.flagged and not txn.alert_sent:
        await notifier.send_transaction_alert(
            to_email=user_email,
            merchant=txn.merchant,
            amount=float(txn.amount),
            category=txn.category,
            flag_reason=txn.flag_reason,
        )
        txn.alert_sent = True
        txn.alert_sent_at = datetime.now(timezone.utc)
        try:
            await db.commit()
        except Exception:
            await db.rollback()
            raise

    if txn.flagged and not txn.accountability_alert_sent:
        sent = await send_accountability_alerts_for_transaction(
            db,
            notifier=notifier,
            transaction=txn,
            user_id=user_id,
        )
        if sent:
            try:
                await db.commit()
            except Exception:
                await db.rollback()
                raise

    return txn
