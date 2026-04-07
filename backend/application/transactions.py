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
from ..services.classifier import classify_transaction

logger = logging.getLogger("bank.transactions")


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
) -> Transaction:
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

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await db.refresh(txn)

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

    return txn
