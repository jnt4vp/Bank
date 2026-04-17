from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.user import User
from ..ports.notifier import NotifierPort
from ..security import (
    InvalidTokenError,
    create_access_token,
    decode_access_token_subject,
)
from ..services.auth import (
    DuplicateEmailError,
    authenticate_user,
    ensure_dev_seed_user as seed_dev_user,
    generate_reset_token,
    register_user,
    reset_password,
)

bearer_scheme = HTTPBearer(auto_error=False)


def _is_duplicate_email_integrity_error(exc: IntegrityError) -> bool:
    message = str(getattr(exc, "orig", exc)).lower()
    return "email" in message and ("unique" in message or "duplicate key" in message)


@dataclass(frozen=True)
class RegistrationResult:
    user: User
    access_token: str
    token_type: str = "bearer"


@dataclass(frozen=True)
class LoginResult:
    access_token: str
    token_type: str = "bearer"


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise credentials_exception

    token = credentials.credentials

    try:
        user_id = decode_access_token_subject(token)
    except InvalidTokenError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    return user


async def register_account(
    db: AsyncSession,
    *,
    name: str,
    email: str,
    password: str,
    phone: str | None,
) -> RegistrationResult:
    try:
        user = await register_user(
            db,
            name=name,
            email=email,
            password=password,
            phone=phone,
        )
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if _is_duplicate_email_integrity_error(exc):
            raise DuplicateEmailError from exc
        raise

    await db.refresh(user)
    access_token = create_access_token(data={"sub": str(user.id)})
    return RegistrationResult(user=user, access_token=access_token)


async def login_account(
    db: AsyncSession,
    *,
    email: str,
    password: str,
) -> LoginResult:
    user = await authenticate_user(db, email, password)
    access_token = create_access_token(data={"sub": str(user.id)})
    return LoginResult(access_token=access_token)


async def send_password_reset_link(
    db: AsyncSession,
    *,
    email: str,
    notifier: NotifierPort,
) -> None:
    token = await generate_reset_token(db, email)
    if not token:
        return

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    from ..config import get_settings

    settings = get_settings()
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    await notifier.send_password_reset(to_email=email, reset_url=reset_url)


async def reset_account_password(
    db: AsyncSession,
    *,
    token: str,
    new_password: str,
) -> None:
    await reset_password(db, token, new_password)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise


async def ensure_dev_seed_user_exists(db: AsyncSession) -> User | None:
    user = await seed_dev_user(db)
    if user is None:
        return None

    state = inspect(user)
    if state.pending or state.modified:
        try:
            await db.commit()
        except Exception:
            await db.rollback()
            raise

        await db.refresh(user)

    return user
