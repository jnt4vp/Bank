from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.accountability_alert_settings import AccountabilityAlertSettings
from ..models.accountability_partner import AccountabilityPartner
from ..models.transaction import Transaction
from ..models.user import User
from ..ports.notifier import NotifierPort

logger = logging.getLogger("bank.accountability")

DEFAULT_SUBJECT = "Accountability Alert"
DEFAULT_BODY = (
    "Hi {partner_name},\n\n"
    "{user_name} asked to be held accountable.\n"
    "A flagged purchase was detected in category {category} for ${amount} at {merchant}.\n"
    "Description: {description}\n"
    "Date: {transaction_date}\n"
    "Message from {user_name}: {custom_message}\n"
)


def _safe_template(template: str, values: dict[str, Any]) -> str:
    rendered = template
    for key, value in values.items():
        rendered = rendered.replace(f"{{{key}}}", str(value))
    return rendered


async def send_accountability_alerts_for_transaction(
    db: AsyncSession,
    *,
    notifier: NotifierPort,
    transaction: Transaction,
    user_id: UUID,
) -> bool:
    if not hasattr(db, "execute"):
        return False
    if not transaction.flagged or transaction.accountability_alert_sent:
        return False

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        return False

    settings_result = await db.execute(
        select(AccountabilityAlertSettings).where(AccountabilityAlertSettings.user_id == user_id)
    )
    settings = settings_result.scalar_one_or_none()
    alerts_enabled = settings.alerts_enabled if settings else True
    if not alerts_enabled:
        return False

    partners_result = await db.execute(
        select(AccountabilityPartner).where(
            AccountabilityPartner.user_id == user_id,
            AccountabilityPartner.is_active.is_(True),
        )
    )
    partners = list(partners_result.scalars().all())
    if not partners:
        return False

    subject_template = (settings.custom_subject_template if settings else None) or DEFAULT_SUBJECT
    body_template = (settings.custom_body_template if settings else None) or DEFAULT_BODY
    custom_message = (settings.custom_message if settings and settings.custom_message else "I want to stay on track.")
    sent_any = False

    for partner in partners:
        values = {
            "partner_name": partner.partner_name or "Accountability Partner",
            "user_name": user.name or user.email,
            "category": transaction.category or "unknown",
            "amount": f"{float(Decimal(transaction.amount)):.2f}",
            "merchant": transaction.merchant,
            "description": transaction.description or "",
            "transaction_date": transaction.date.isoformat() if transaction.date else "",
            "custom_message": custom_message,
        }
        subject = _safe_template(subject_template, values)
        body = _safe_template(body_template, values)
        try:
            await notifier.send_accountability_alert(
                to_email=partner.partner_email,
                subject=subject,
                body=body,
            )
            sent_any = True
        except Exception:
            logger.exception(
                "Failed accountability alert for txn %s partner %s",
                transaction.id,
                partner.partner_email,
            )

    if sent_any:
        transaction.accountability_alert_sent = True
        transaction.accountability_alert_sent_at = datetime.now(timezone.utc)
    return sent_any
