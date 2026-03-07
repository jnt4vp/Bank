from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..repositories.users import create_user, get_user_by_email, get_user_by_reset_token
from ..security import hash_password, verify_password

settings = get_settings()
logger = logging.getLogger("bank.auth")


class DuplicateEmailError(Exception):
    """Raised when attempting to register an existing email."""


class InvalidCredentialsError(Exception):
    """Raised when login credentials are invalid."""


class InvalidResetTokenError(Exception):
    """Raised when a reset token is invalid or expired."""


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


async def register_user(
    db: AsyncSession,
    *,
    name: str,
    email: str,
    password: str,
    phone: str | None,
):
    """Register a new user (hashes password before storing)."""
    existing_user = await get_user_by_email(db, email)
    if existing_user:
        raise DuplicateEmailError

    return await create_user(
        db,
        email=email,
        password_hash=hash_password(password),
        name=name,
        phone=phone,
    )


async def authenticate_user(db: AsyncSession, email: str, password: str):
    """Authenticate a user by email/password (verifies password hash)."""
    user = await get_user_by_email(db, email)
    if not user:
        raise InvalidCredentialsError

    if not verify_password(password, user.password_hash):
        raise InvalidCredentialsError

    return user


async def generate_reset_token(db: AsyncSession, email: str) -> str | None:
    """Generate a password reset token for the user. Returns None if email not found."""
    user = await get_user_by_email(db, email)
    if not user:
        return None

    token = secrets.token_urlsafe(48)
    user.reset_token = token
    user.reset_token_expires = datetime.now(timezone.utc) + timedelta(hours=1)
    return token


async def reset_password(db: AsyncSession, token: str, new_password: str) -> None:
    """Validate the reset token and update the user's password."""
    user = await get_user_by_reset_token(db, token)
    if not user or not user.reset_token_expires:
        raise InvalidResetTokenError

    expires = _as_utc(user.reset_token_expires)
    if expires < datetime.now(timezone.utc):
        raise InvalidResetTokenError

    user.password_hash = hash_password(new_password)
    user.reset_token = None
    user.reset_token_expires = None


async def ensure_dev_seed_user(db: AsyncSession):
    """Create the documented example user automatically in non-production envs."""
    if settings.APP_ENV == "production" or not settings.DEV_SEED_EXAMPLE_USER:
        return None

    existing_user = await get_user_by_email(db, settings.DEV_SEED_EXAMPLE_EMAIL)
    if existing_user:
        return existing_user

    user = await create_user(
        db,
        email=settings.DEV_SEED_EXAMPLE_EMAIL,
        password_hash=hash_password(settings.DEV_SEED_EXAMPLE_PASSWORD),
        name=settings.DEV_SEED_EXAMPLE_NAME,
        phone=None,
    )
    logger.info("Created development seed user: %s", user.email)
    return user
