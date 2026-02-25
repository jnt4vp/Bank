from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..repositories.counter import get_or_create_counter, increment_counter

router = APIRouter()


@router.get("")
async def get_counter(db: AsyncSession = Depends(get_db)):
    counter = await get_or_create_counter(db)
    return {"value": counter.value}


@router.post("/increment")
async def inc_counter(db: AsyncSession = Depends(get_db)):
    counter = await increment_counter(db)
    return {"value": counter.value}
