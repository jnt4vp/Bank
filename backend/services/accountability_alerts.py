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
        logger.warning(
            "Accountability alerts skipped for txn %s: db session does not support execute()",
            getattr(transaction, "id", "unknown"),
        )
        return False

    txn_id = getattr(transaction, "id", "unknown")
    logger.info(
        "Accountability alert check | txn=%s | user=%s | flagged=%s | already_sent=%s",
        txn_id,
        user_id,
        transaction.flagged,
        transaction.accountability_alert_sent,
    )

    if not transaction.flagged:
        logger.info("Accountability alerts skipped for txn %s: transaction is not flagged", txn_id)
        return False

    if transaction.accountability_alert_sent:
        logger.info("Accountability alerts skipped for txn %s: alerts already sent", txn_id)
        return False

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        logger.warning("Accountability alerts skipped for txn %s: user %s was not found", txn_id, user_id)
        return False

    settings_result = await db.execute(
        select(AccountabilityAlertSettings).where(AccountabilityAlertSettings.user_id == user_id)
    )
    settings = settings_result.scalar_one_or_none()
    alerts_enabled = settings.alerts_enabled if settings else True
    if not alerts_enabled:
        logger.info("Accountability alerts skipped for txn %s: user alerts are disabled", txn_id)
        return False

    pacts_result = await db.execute(
        select(Pact)
        .options(selectinload(Pact.accountability_settings))
        .where(
            Pact.user_id == user_id,
            Pact.status == "active",
        )
    )
    active_pacts = pacts_result.scalars().unique().all()
    matched_pacts = [
        pact
        for pact in active_pacts
        if pact.accountability_settings
        and pact.accountability_settings.accountability_partner_ids
        and _transaction_matches_pact(transaction, pact)
    ]
    if not matched_pacts:
        logger.info(
            "Accountability alerts skipped for txn %s: no matching friend-accountability pacts among %d active pact(s)",
            txn_id,
            len(active_pacts),
        )
        return False

    logger.info(
        "Accountability alert pact resolution | txn=%s | matched_pacts=%d",
        txn_id,
        len(matched_pacts),
    )

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
        active_partner_ids = [str(partner.id) for partner in all_active_partners]
        logger.warning(
            "Accountability alerts skipped for txn %s: no eligible active partners were resolved "
            "(selected_ids=%s, legacy_fallback=%s, active_partner_ids=%s)",
            txn_id,
            sorted(selected_partner_ids),
            wants_legacy_fallback,
            active_partner_ids,
        )
        return False

    logger.info(
        "Accountability partner resolution | txn=%s | partners=%d | selected_ids=%d | legacy_fallback=%s",
        txn_id,
        len(partners),
        len(selected_partner_ids),
        wants_legacy_fallback,
    )

    subject_template = (settings.custom_subject_template if settings else None) or DEFAULT_SUBJECT
    body_template = (settings.custom_body_template if settings else None) or DEFAULT_BODY
    custom_message = (settings.custom_message if settings and settings.custom_message else "I want to stay on track.")
    delivered_count = 0

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
            logger.info(
                "Sending accountability alert | txn=%s | partner_id=%s | to=%s",
                txn_id,
                getattr(partner, "id", "unknown"),
                partner.partner_email,
            )
            delivered = await notifier.send_accountability_alert(
                to_email=partner.partner_email,
                subject=subject,
                body=body,
            )
            if delivered:
                delivered_count += 1
                logger.info(
                    "Delivered accountability alert | txn=%s | to=%s",
                    txn_id,
                    partner.partner_email,
                )
            else:
                logger.warning(
                    "Notifier reported accountability alert not delivered | txn=%s | to=%s",
                    txn_id,
                    partner.partner_email,
                )
        except Exception:
            logger.exception(
                "Failed accountability alert for txn %s partner %s",
                txn_id,
                partner.partner_email,
            )

    if delivered_count:
        transaction.accountability_alert_sent = True
        transaction.accountability_alert_sent_at = datetime.now(timezone.utc)
        logger.info(
            "Accountability alert summary | txn=%s | delivered=%d | attempted=%d",
            txn_id,
            delivered_count,
            len(partners),
        )
        return True

    logger.warning(
        "Accountability alerts not delivered for txn %s after %d attempt(s)",
        txn_id,
        len(partners),
    )
    return False
