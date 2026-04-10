from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import async_session
from ..models.accountability_partner import AccountabilityPartner
from ..models.user import User
from ..models.pact import Pact
from ..models.accountability_settings import AccountabilitySettings
from ..schemas.accountability_settings import (
    AccountabilitySettingsCreate,
    AccountabilitySettingsOut,
)
from ..application.auth import get_current_user
from ..services.simulated_savings_transfers import backfill_simulated_savings_for_user


router = APIRouter()


async def get_db():
    async with async_session() as session:
        yield session


async def _validated_partner_ids(
    db: AsyncSession,
    *,
    user_id,
    accountability_type: str,
    partner_ids: list,
) -> list[str]:
    if accountability_type != "friend":
        return []

    if not partner_ids:
        return []

    result = await db.execute(
        select(AccountabilityPartner.id).where(
            AccountabilityPartner.user_id == user_id,
            AccountabilityPartner.id.in_(partner_ids),
        )
    )
    matched_ids = [row for row in result.scalars().all()]
    if len(matched_ids) != len(set(partner_ids)):
        raise HTTPException(status_code=400, detail="One or more accountability partners are invalid")
    return [str(partner_id) for partner_id in matched_ids]


@router.post("", response_model=AccountabilitySettingsOut)
async def upsert_accountability_settings(
    payload: AccountabilitySettingsCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pact_result = await db.execute(
        select(Pact).where(
            Pact.id == payload.pact_id,
            Pact.user_id == current_user.id,
        )
    )
    pact = pact_result.scalar_one_or_none()

    if pact is None:
        raise HTTPException(status_code=404, detail="Pact not found")

    partner_ids = await _validated_partner_ids(
        db,
        user_id=current_user.id,
        accountability_type=payload.accountability_type,
        partner_ids=payload.accountability_partner_ids,
    )

    result = await db.execute(
        select(AccountabilitySettings).where(
            AccountabilitySettings.pact_id == payload.pact_id
        )
    )
    settings = result.scalar_one_or_none()

    if settings is None:
        settings = AccountabilitySettings(
            pact_id=payload.pact_id,
            accountability_type=payload.accountability_type,
            discipline_savings_percentage=payload.discipline_savings_percentage,
            accountability_note=payload.accountability_note,
            accountability_partner_ids=partner_ids,
        )
        db.add(settings)
    else:
        settings.accountability_type = payload.accountability_type
        settings.discipline_savings_percentage = payload.discipline_savings_percentage
        settings.accountability_note = payload.accountability_note
        settings.accountability_partner_ids = partner_ids

    await db.commit()

    ledger_added = await backfill_simulated_savings_for_user(
        db, user_id=current_user.id
    )
    if ledger_added:
        await db.commit()

    refreshed_result = await db.execute(
        select(AccountabilitySettings).where(
            AccountabilitySettings.pact_id == payload.pact_id
        )
    )
    refreshed_settings = refreshed_result.scalar_one()

    return AccountabilitySettingsOut(
        id=refreshed_settings.id,
        pact_id=refreshed_settings.pact_id,
        accountability_type=refreshed_settings.accountability_type,
        accountability_note=refreshed_settings.accountability_note,
        discipline_savings_percentage=float(
            refreshed_settings.discipline_savings_percentage or 0
        ),
        accountability_partner_ids=refreshed_settings.accountability_partner_ids or [],
    )


@router.get("/{pact_id}", response_model=AccountabilitySettingsOut)
async def get_accountability_settings(
    pact_id,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pact_result = await db.execute(
        select(Pact).where(
            Pact.id == pact_id,
            Pact.user_id == current_user.id,
        )
    )
    pact = pact_result.scalar_one_or_none()

    if pact is None:
        raise HTTPException(status_code=404, detail="Pact not found")

    result = await db.execute(
        select(AccountabilitySettings).where(
            AccountabilitySettings.pact_id == pact_id
        )
    )
    settings = result.scalar_one_or_none()

    if settings is None:
        raise HTTPException(status_code=404, detail="Accountability settings not found")

    return AccountabilitySettingsOut(
        id=settings.id,
        pact_id=settings.pact_id,
        accountability_type=settings.accountability_type,
        accountability_note=settings.accountability_note,
        discipline_savings_percentage=float(
            settings.discipline_savings_percentage or 0
        ),
        accountability_partner_ids=settings.accountability_partner_ids or [],
    )
