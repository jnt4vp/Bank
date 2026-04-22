import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..dependencies.auth import get_current_user
from ..models.goal import Goal
from ..models.user import User
from ..schemas.goals import (
    GoalCreate,
    GoalResponse,
    GoalSpendingRequest,
    GoalSpendingResponse,
)
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


@router.get("", response_model=list[GoalResponse])
async def list_goals(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Goal)
        .where(Goal.user_id == current_user.id)
        .order_by(Goal.created_at.asc())
    )
    return list(result.scalars().all())


@router.post("", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(
    payload: GoalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    goal = Goal(
        user_id=current_user.id,
        category=payload.category,
        monthly_limit=payload.monthly_limit,
    )
    db.add(goal)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have a goal with that name.",
        )
    await db.refresh(goal)
    return goal


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(
    goal_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.user_id == current_user.id)
    )
    goal = result.scalar_one_or_none()
    if goal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found."
        )
    await db.delete(goal)
    await db.commit()
