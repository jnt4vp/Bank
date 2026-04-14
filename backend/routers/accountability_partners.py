import logging

from fastapi import APIRouter, Depends, HTTPException, status
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..application.auth import get_current_user
from ..database import get_db
from ..models.accountability_alert_settings import AccountabilityAlertSettings
from ..models.accountability_partner import AccountabilityPartner
from ..models.accountability_settings import AccountabilitySettings
from ..models.pact import Pact
from ..models.user import User
from ..schemas.accountability_partners import (
    AccountabilityAlertSettingsOut,
    AccountabilityAlertSettingsUpdate,
    AccountabilityPartnerCreate,
    AccountabilityPartnerOut,
    AccountabilityPartnerUpdate,
)

router = APIRouter()
logger = logging.getLogger("bank.accountability")


async def _prune_partner_references(
    db: AsyncSession,
    *,
    user_id,
    partner_id: UUID,
) -> int:
    partner_id_str = str(partner_id)
    result = await db.execute(
        select(AccountabilitySettings)
        .join(Pact, Pact.id == AccountabilitySettings.pact_id)
        .where(Pact.user_id == user_id)
    )
    settings_rows = list(result.scalars().all())

    pruned = 0
    for settings in settings_rows:
        current_ids = settings.accountability_partner_ids or []
        normalized_ids = [str(value) for value in current_ids]
        if partner_id_str not in normalized_ids:
            continue

        settings.accountability_partner_ids = [
            current_id
            for current_id in current_ids
            if str(current_id) != partner_id_str
        ]
        pruned += 1

    return pruned


@router.get("", response_model=list[AccountabilityPartnerOut])
async def list_partners(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AccountabilityPartner)
        .where(AccountabilityPartner.user_id == current_user.id)
        .order_by(AccountabilityPartner.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("", response_model=AccountabilityPartnerOut, status_code=status.HTTP_201_CREATED)
async def create_partner(
    payload: AccountabilityPartnerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    partner = AccountabilityPartner(
        user_id=current_user.id,
        partner_name=payload.partner_name,
        partner_email=str(payload.partner_email).lower(),
        relationship_label=payload.relationship_label,
        is_active=payload.is_active,
    )
    db.add(partner)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Partner email already exists")
    await db.refresh(partner)
    return partner


@router.get("/settings", response_model=AccountabilityAlertSettingsOut)
async def get_alert_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AccountabilityAlertSettings).where(
            AccountabilityAlertSettings.user_id == current_user.id
        )
    )
    settings = result.scalar_one_or_none()
    if settings is None:
        return AccountabilityAlertSettingsOut(alerts_enabled=True)
    return AccountabilityAlertSettingsOut(
        alerts_enabled=settings.alerts_enabled,
        custom_subject_template=settings.custom_subject_template,
        custom_body_template=settings.custom_body_template,
        custom_message=settings.custom_message,
    )


@router.put("/settings", response_model=AccountabilityAlertSettingsOut)
async def update_alert_settings(
    payload: AccountabilityAlertSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AccountabilityAlertSettings).where(
            AccountabilityAlertSettings.user_id == current_user.id
        )
    )
    settings = result.scalar_one_or_none()
    if settings is None:
        settings = AccountabilityAlertSettings(
            user_id=current_user.id,
            alerts_enabled=payload.alerts_enabled,
            custom_subject_template=payload.custom_subject_template,
            custom_body_template=payload.custom_body_template,
            custom_message=payload.custom_message,
        )
        db.add(settings)
    else:
        settings.alerts_enabled = payload.alerts_enabled
        settings.custom_subject_template = payload.custom_subject_template
        settings.custom_body_template = payload.custom_body_template
        settings.custom_message = payload.custom_message
    await db.commit()
    return AccountabilityAlertSettingsOut(
        alerts_enabled=settings.alerts_enabled,
        custom_subject_template=settings.custom_subject_template,
        custom_body_template=settings.custom_body_template,
        custom_message=settings.custom_message,
    )


@router.put("/{partner_id:uuid}", response_model=AccountabilityPartnerOut)
async def update_partner(
    partner_id: UUID,
    payload: AccountabilityPartnerUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AccountabilityPartner).where(
            AccountabilityPartner.id == partner_id,
            AccountabilityPartner.user_id == current_user.id,
        )
    )
    partner = result.scalar_one_or_none()
    if partner is None:
        raise HTTPException(status_code=404, detail="Partner not found")

    partner.partner_name = payload.partner_name
    partner.partner_email = str(payload.partner_email).lower()
    partner.relationship_label = payload.relationship_label
    partner.is_active = payload.is_active

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Partner email already exists")
    await db.refresh(partner)
    return partner


@router.delete("/{partner_id:uuid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_partner(
    partner_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AccountabilityPartner).where(
            AccountabilityPartner.id == partner_id,
            AccountabilityPartner.user_id == current_user.id,
        )
    )
    partner = result.scalar_one_or_none()
    if partner is None:
        raise HTTPException(status_code=404, detail="Partner not found")

    pruned_settings = await _prune_partner_references(
        db,
        user_id=current_user.id,
        partner_id=partner_id,
    )
    if pruned_settings:
        logger.info(
            "Pruned deleted accountability partner %s from %d pact setting(s) for user %s",
            partner_id,
            pruned_settings,
            current_user.id,
        )
    await db.delete(partner)
    await db.commit()
