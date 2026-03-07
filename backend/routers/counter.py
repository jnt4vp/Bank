from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..application.counter import get_counter_value, increment_counter_value
from ..database import get_db

router = APIRouter()


@router.get("")
async def get_counter(db: AsyncSession = Depends(get_db)):
    counter = await get_counter_value(db)
    return {"value": counter.value}


@router.post("/increment")
async def inc_counter(db: AsyncSession = Depends(get_db)):
    counter = await increment_counter_value(db)
    return {"value": counter.value}
