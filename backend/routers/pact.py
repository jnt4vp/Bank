from datetime import datetime, timezone
from uuid import UUID
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models.pact import Pact
from ..models.user import User
from ..schemas.pact import PactCreate, PactUpdate, PactResponse
from ..dependencies.auth import get_current_user

router = APIRouter(prefix="/api/pacts", tags=["pacts"])


@router.post("", response_model=PactResponse, status_code=status.HTTP_201_CREATED)
async def create_pact(
    payload: PactCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Determine cleaned values
    preset = payload.preset_category.strip() if payload.preset_category else None
    custom = payload.custom_category.strip() if payload.custom_category else None

    # Reject both filled in a single request — caller should create two separate pacts
    if preset and custom:
        raise HTTPException(
            status_code=400,
            detail="Provide either preset_category or custom_category, not both. Create separate pacts instead.",
        )

    final_category = custom or preset

    if not final_category:
        raise HTTPException(
            status_code=400,
            detail="A preset category or custom category is required.",
        )

    # If the caller passed a locked_until, keep it; otherwise it will remain unlocked.
    new_pact = Pact(
        user_id=current_user.id,
        preset_category=preset,
        custom_category=custom,
        category=final_category,
        status=payload.status or "active",
        locked_until=payload.locked_until,
    )

    db.add(new_pact)
    await db.commit()
    await db.refresh(new_pact)

    return new_pact


@router.get("/{pact_id}", response_model=PactResponse)
async def get_pact(
    pact_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Pact).where(Pact.id == pact_id))
    pact = result.scalar_one_or_none()

    if not pact:
        raise HTTPException(status_code=404, detail="Pact not found")

    if pact.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this pact")

    return pact


@router.get("/user/{user_id}", response_model=List[PactResponse])
async def get_user_pacts(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view these pacts")

    result = await db.execute(
        select(Pact)
        .where(Pact.user_id == user_id)
        .order_by(Pact.category.asc())
    )
    return result.scalars().all()


@router.put("/{pact_id}", response_model=PactResponse)
async def update_pact(
    pact_id: UUID,
    payload: PactUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Pact).where(Pact.id == pact_id))
    pact = result.scalar_one_or_none()

    if not pact:
        raise HTTPException(status_code=404, detail="Pact not found")

    # Ownership check
    if pact.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this pact")

    # Enforce lock: once set, no changes until it expires
    if pact.locked_until and pact.locked_until > datetime.now(timezone.utc):
        raise HTTPException(
            status_code=403,
            detail="This pact is locked and cannot be modified until the lock expires.",
        )

    update_data = payload.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(pact, field, value)


    # Recompute category and validate that exactly one source is present
    preset = pact.preset_category.strip() if pact.preset_category else None
    custom = pact.custom_category.strip() if pact.custom_category else None

    if preset and custom:
        raise HTTPException(
            status_code=400,
            detail="A pact must have exactly one source: either preset_category or custom_category.",
        )

    pact.category = custom or preset

    if not pact.category:
        raise HTTPException(
            status_code=400,
            detail="A preset category or custom category is required.",
        )

    await db.commit()
    await db.refresh(pact)

    return pact


@router.delete("/{pact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pact(
    pact_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Pact).where(Pact.id == pact_id))
    pact = result.scalar_one_or_none()

    if not pact:
        raise HTTPException(status_code=404, detail="Pact not found")

    if pact.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this pact")

    await db.delete(pact)
    await db.commit()