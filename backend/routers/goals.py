from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..dependencies.auth import get_current_user
from ..models.user import User
from ..schemas.goals import GoalSpendingRequest, GoalSpendingResponse
from ..services.goal_attribution import compute_goal_spending

router = APIRouter()


@router.post("/spending-breakdown", response_model=GoalSpendingResponse)
async def goal_spending_breakdown(
    payload: GoalSpendingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings = get_settings()
    spent, method, llm_n = await compute_goal_spending(
        db,
        current_user,
        goals=payload.goals,
        period_start=payload.period_start,
        period_end=payload.period_end,
        settings=settings,
    )
    return GoalSpendingResponse(
        spent_by_goal=spent,
        method=method,
        llm_assigned_count=llm_n,
    )
