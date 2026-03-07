from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models.user import User
from ..ports.notifier import NotifierPort
from ..security import create_access_token
from ..services.auth import (
    authenticate_user,
    DuplicateEmailError,
    ensure_dev_seed_user as seed_dev_user,
    generate_reset_token,
    register_user,
    reset_password,
)


@dataclass(frozen=True)
class RegistrationResult:
    user: User
    access_token: str
    token_type: str = "bearer"


@dataclass(frozen=True)
class LoginResult:
    access_token: str
    token_type: str = "bearer"


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
        raise DuplicateEmailError from exc

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

    if inspect(user).pending:
        try:
            await db.commit()
        except Exception:
            await db.rollback()
            raise

        await db.refresh(user)

    return user
