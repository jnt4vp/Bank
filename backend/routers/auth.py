import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..application.auth import (
    login_account,
    register_account,
    reset_account_password,
    send_password_reset_link,
)
from ..database import get_db
from ..dependencies.auth import get_current_user
from ..dependencies.integrations import get_notifier
from ..dependencies.rate_limit import rate_limit_auth
from ..models.user import User
from ..ports.notifier import NotifierPort
from ..schemas.auth import AuthResponse, ForgotPasswordRequest, LoginRequest, ResetPasswordRequest, Token
from ..schemas.user import UserCreate, UserResponse, UserUpdate
from ..security import PasswordValidationError
from ..services.auth import (
    DuplicateEmailError,
    InvalidCredentialsError,
    InvalidResetTokenError,
    PasswordReusedError,
)
from ..services.card_lock import extend_card_lock
from ..services.discipline import (
    calculate_discipline_score,
    count_transactions_for_discipline_score,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/register", response_model=AuthResponse, dependencies=[Depends(rate_limit_auth)])
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    try:
        result = await register_account(
            db,
            name=user_data.name,
            email=user_data.email,
            password=user_data.password,
            phone=user_data.phone,
        )
    except DuplicateEmailError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        ) from exc
    except PasswordValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return AuthResponse(
        user=UserResponse.model_validate(result.user),
        access_token=result.access_token,
        token_type=result.token_type,
    )


@router.post("/login", response_model=Token, dependencies=[Depends(rate_limit_auth)])
async def login(login_data: LoginRequest, db: AsyncSession = Depends(get_db)):
    try:
        result = await login_account(
            db,
            email=login_data.email,
            password=login_data.password,
        )
    except InvalidCredentialsError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    return Token(
        access_token=result.access_token,
        token_type=result.token_type,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        total_transactions, flagged_transactions = await count_transactions_for_discipline_score(
            db,
            user_id=current_user.id,
            discipline_score_started_at=current_user.discipline_score_started_at,
        )
        score = calculate_discipline_score(
            total_transactions=total_transactions,
            flagged_transactions=flagged_transactions,
        )
        if current_user.discipline_score != score:
            current_user.discipline_score = score
            await db.commit()
            await db.refresh(current_user)
    except SQLAlchemyError:
        await db.rollback()
        logger.warning(
            "Could not refresh discipline_score for user %s — returning cached user row",
            current_user.id,
            exc_info=True,
        )
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.name is not None:
        trimmed = payload.name.strip()
        if not trimmed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Name cannot be empty.",
            )
        current_user.name = trimmed
    if payload.email is not None:
        next_email = str(payload.email).strip().lower()
        if next_email != current_user.email:
            result = await db.execute(
                select(User.id).where(User.email == next_email, User.id != current_user.id)
            )
            if result.scalar_one_or_none() is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="That email is already in use.",
                )
            current_user.email = next_email
    if payload.phone is not None:
        current_user.phone = payload.phone.strip() or None
    if payload.discipline_savings_percentage is not None:
        current_user.discipline_savings_percentage = payload.discipline_savings_percentage
    if payload.discipline_ui_mode is not None:
        next_mode = payload.discipline_ui_mode.strip().lower()
        if next_mode not in {"discipline", "classic"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="discipline_ui_mode must be 'discipline' or 'classic'",
            )
        current_user.discipline_ui_mode = next_mode
    if payload.dashboard_force_sky is not None:
        current_user.dashboard_force_sky = payload.dashboard_force_sky
    if payload.reset_discipline_window is True:
        current_user.discipline_score_started_at = datetime.now(timezone.utc)
        total_rw, flagged_rw = await count_transactions_for_discipline_score(
            db,
            user_id=current_user.id,
            discipline_score_started_at=current_user.discipline_score_started_at,
        )
        current_user.discipline_score = calculate_discipline_score(
            total_transactions=total_rw,
            flagged_transactions=flagged_rw,
        )
    if payload.card_lock_auto_enabled is not None:
        current_user.card_lock_auto_enabled = payload.card_lock_auto_enabled
    if payload.card_locked is True:
        await extend_card_lock(db, user_id=current_user.id)
    elif payload.card_locked is False:
        current_user.card_locked_until = None
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/forgot-password", status_code=status.HTTP_200_OK, dependencies=[Depends(rate_limit_auth)])
async def forgot_password(
    payload: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
    notifier: NotifierPort = Depends(get_notifier),
):
    await send_password_reset_link(db, email=payload.email, notifier=notifier)
    # Always return 200 so we don't leak whether an email exists
    return {"message": "If that email exists, a reset link has been sent."}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
async def do_reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    try:
        await reset_account_password(
            db,
            token=payload.token,
            new_password=payload.new_password,
        )
    except PasswordValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except PasswordReusedError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This password was used recently. Please choose a different password.",
        )
    except InvalidResetTokenError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token.",
        )
    return {"message": "Password updated successfully."}
