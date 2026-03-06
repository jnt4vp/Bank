from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..dependencies.auth import get_current_user
from ..models.user import User
from ..schemas.auth import AuthResponse, ForgotPasswordRequest, LoginRequest, ResetPasswordRequest, Token
from ..schemas.user import UserCreate, UserResponse
from ..services.auth import (
    DuplicateEmailError,
    InvalidCredentialsError,
    InvalidResetTokenError,
    authenticate_user,
    create_access_token,
    generate_reset_token,
    register_user,
    reset_password,
)
from ..services.email import send_reset_email

router = APIRouter()


@router.post("/register", response_model=AuthResponse)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    try:
        user = await register_user(db, user_data)
    except DuplicateEmailError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        ) from exc

    access_token = create_access_token(data={"sub": str(user.id)})

    return AuthResponse(
        user=UserResponse.model_validate(user),
        access_token=access_token,
        token_type="bearer",
    )


@router.post("/login", response_model=Token)
async def login(login_data: LoginRequest, db: AsyncSession = Depends(get_db)):
    try:
        user = await authenticate_user(db, login_data.email, login_data.password)
    except InvalidCredentialsError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    access_token = create_access_token(data={"sub": str(user.id)})
    return Token(access_token=access_token)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    token = await generate_reset_token(db, payload.email)
    if token:
        settings = get_settings()
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        send_reset_email(to_email=payload.email, reset_url=reset_url)
    # Always return 200 so we don't leak whether an email exists
    return {"message": "If that email exists, a reset link has been sent."}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
async def do_reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    try:
        await reset_password(db, payload.token, payload.new_password)
    except InvalidResetTokenError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token.",
        )
    return {"message": "Password updated successfully."}
