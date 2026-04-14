from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.accountability_alert_settings import AccountabilityAlertSettings
from ..models.accountability_partner import AccountabilityPartner
from ..models.pact import Pact
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


def _norm(value: str | None) -> str:
    return (value or "").strip().lower()


def _transaction_matches_pact(txn: Transaction, pact: Pact) -> bool:
    tx_cat = _norm(txn.category)
    tx_merchant = _norm(txn.merchant)
    tx_desc = _norm(txn.description)
    pact_cat = _norm(pact.custom_category or pact.category or pact.preset_category)
    if not pact_cat:
        return False
    return (
        pact_cat in tx_cat
        or tx_cat in pact_cat
        or pact_cat in tx_merchant
        or pact_cat in tx_desc
    )


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

    pacts_result = await db.execute(
        select(Pact)
        .options(selectinload(Pact.accountability_settings))
        .where(
            Pact.user_id == user_id,
            Pact.status == "active",
        )
    )
    matched_pacts = [
        pact
        for pact in pacts_result.scalars().unique().all()
        if pact.accountability_settings
        and pact.accountability_settings.accountability_partner_ids
        and _transaction_matches_pact(transaction, pact)
    ]
    if not matched_pacts:
        return False

    selected_partner_ids: set[str] = set()
    for pact in matched_pacts:
        partner_ids = pact.accountability_settings.accountability_partner_ids or []
        selected_partner_ids.update(str(partner_id) for partner_id in partner_ids)

    partners_result = await db.execute(
        select(AccountabilityPartner).where(
            AccountabilityPartner.user_id == user_id,
            AccountabilityPartner.is_active.is_(True),
        )
    )
    all_active_partners = list(partners_result.scalars().all())
    partners = [
        partner
        for partner in all_active_partners
        if str(partner.id) in selected_partner_ids
    ]

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
