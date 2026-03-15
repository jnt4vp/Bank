from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import async_session
from ..models.user import User
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
    user_result = await db.execute(select(User).where(User.id == current_user.id))
    db_user = user_result.scalar_one_or_none()

    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    db_user.discipline_savings_percentage = payload.discipline_savings_percentage

    result = await db.execute(
        select(AccountabilitySettings).where(
            AccountabilitySettings.user_id == current_user.id
        )
    )
    settings = result.scalar_one_or_none()

    if settings is None:
        settings = AccountabilitySettings(
            user_id=current_user.id,
            accountability_type=payload.accountability_type,
            accountability_note=payload.accountability_note,
        )
        db.add(settings)
    else:
        settings.accountability_type = payload.accountability_type
        settings.accountability_note = payload.accountability_note

    await db.commit()

    # re-query after commit to avoid refresh/session weirdness
    refreshed_result = await db.execute(
        select(AccountabilitySettings).where(
            AccountabilitySettings.user_id == current_user.id
        )
    )
    refreshed_settings = refreshed_result.scalar_one()

    refreshed_user_result = await db.execute(
        select(User).where(User.id == current_user.id)
    )
    refreshed_user = refreshed_user_result.scalar_one()

    return AccountabilitySettingsOut(
        accountability_type=refreshed_settings.accountability_type,
        accountability_note=refreshed_settings.accountability_note,
        discipline_savings_percentage=float(
            refreshed_user.discipline_savings_percentage or 0
        ),
    )


@router.get("", response_model=AccountabilitySettingsOut)
async def get_accountability_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_result = await db.execute(select(User).where(User.id == current_user.id))
    db_user = user_result.scalar_one_or_none()

    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(AccountabilitySettings).where(
            AccountabilitySettings.user_id == current_user.id
        )
    )
    settings = result.scalar_one_or_none()

    if settings is None:
        return AccountabilitySettingsOut(
            accountability_type="",
            accountability_note=None,
            discipline_savings_percentage=float(
                db_user.discipline_savings_percentage or 0
            ),
        )

    return AccountabilitySettingsOut(
        accountability_type=settings.accountability_type,
        accountability_note=settings.accountability_note,
        discipline_savings_percentage=float(
            db_user.discipline_savings_percentage or 0
        ),
    )