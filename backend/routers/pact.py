from uuid import UUID
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models.pact import Pact
from ..schemas.pact import PactCreate, PactUpdate, PactResponse

router = APIRouter(prefix="/api/pacts", tags=["pacts"])


@router.post("", response_model=PactResponse, status_code=status.HTTP_201_CREATED)
async def create_pact(payload: PactCreate, db: AsyncSession = Depends(get_db)):
    new_pact = Pact(
        user_id=payload.user_id,
        template_id=payload.template_id,
        title=payload.title,
        reason=payload.reason,
        goal=payload.goal,
        status=payload.status or "active",
    )

    db.add(new_pact)
    await db.commit()
    await db.refresh(new_pact)

    return new_pact


@router.get("/{pact_id}", response_model=PactResponse)
async def get_pact(pact_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Pact).where(Pact.id == pact_id))
    pact = result.scalar_one_or_none()

    if not pact:
        raise HTTPException(status_code=404, detail="Pact not found")

    return pact


@router.get("/user/{user_id}", response_model=List[PactResponse])
async def get_user_pacts(user_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Pact)
        .where(Pact.user_id == user_id)
        .order_by(Pact.created_at.desc())
    )

    return result.scalars().all()


@router.put("/{pact_id}", response_model=PactResponse)
async def update_pact(pact_id: UUID, payload: PactUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Pact).where(Pact.id == pact_id))
    pact = result.scalar_one_or_none()

    if not pact:
        raise HTTPException(status_code=404, detail="Pact not found")

    update_data = payload.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(pact, field, value)

    await db.commit()
    await db.refresh(pact)

    return pact


@router.delete("/{pact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pact(pact_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Pact).where(Pact.id == pact_id))
    pact = result.scalar_one_or_none()

    if not pact:
        raise HTTPException(status_code=404, detail="Pact not found")

    await db.delete(pact)
    await db.commit()