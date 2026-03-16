from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import async_session
from ..models.user import User
from ..models.pact import Pact
from ..models.accountability_settings import AccountabilitySettings
from ..schemas.accountability_settings import (
    AccountabilitySettingsCreate,
    AccountabilitySettingsOut,
)
from ..application.auth import get_current_user


router = APIRouter()


async def get_db():
    async with async_session() as session:
        yield session


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
        )
        db.add(settings)
    else:
        settings.accountability_type = payload.accountability_type
        settings.discipline_savings_percentage = payload.discipline_savings_percentage
        settings.accountability_note = payload.accountability_note

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
    )