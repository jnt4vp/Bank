from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..dependencies.auth import get_current_user
from ..models.user import User
from ..schemas.simulated_savings_transfer import (
    SimulatedSavingsTransferItem,
    SimulatedSavingsTransfersSummary,
)
from ..services.simulated_savings_transfers import list_simulated_transfers_for_user

router = APIRouter()


@router.get("/", response_model=SimulatedSavingsTransfersSummary)
async def list_my_simulated_savings_transfers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings = get_settings()
    enabled = bool(settings.SIMULATED_TRANSFERS_ENABLED)
    if not enabled:
        return SimulatedSavingsTransfersSummary(
            simulated_transfers_enabled=False,
            total_recorded=0.0,
            transfers=[],
        )

    rows = await list_simulated_transfers_for_user(db, current_user.id)
    items = [SimulatedSavingsTransferItem.model_validate(r) for r in rows]
    total = round(sum(i.amount for i in items), 2)
    return SimulatedSavingsTransfersSummary(
        simulated_transfers_enabled=True,
        total_recorded=total,
        transfers=items,
    )
