from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select, delete

from ..config import get_settings
from ..models.password_history import PasswordHistory
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


class PasswordReusedError(Exception):
    """Raised when a new password matches one of the last 3 passwords."""


async def _check_password_history(db: AsyncSession, user_id, new_password: str) -> None:
    """Raise PasswordReusedError if new_password matches any of the last 3 stored hashes."""
    result = await db.execute(
        select(PasswordHistory)
        .where(PasswordHistory.user_id == user_id)
        .order_by(PasswordHistory.created_at.desc())
        .limit(3)
    )
    for entry in result.scalars().all():
        if verify_password(new_password, entry.password_hash):
            raise PasswordReusedError


async def _save_password_history(db: AsyncSession, user_id, password_hash: str) -> None:
    """Store password hash in history and prune entries older than the last 3."""
    db.add(PasswordHistory(user_id=user_id, password_hash=password_hash))
    await db.flush()

    # keep only the 3 most recent entries
    result = await db.execute(
        select(PasswordHistory.id)
        .where(PasswordHistory.user_id == user_id)
        .order_by(PasswordHistory.created_at.desc())
        .offset(3)
    )
    old_ids = [row[0] for row in result.all()]
    if old_ids:
        await db.execute(delete(PasswordHistory).where(PasswordHistory.id.in_(old_ids)))


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

    new_hash = hash_password(password, email=email)
    user = await create_user(db, email=email, password_hash=new_hash, name=name, phone=phone)
    await _save_password_history(db, user.id, new_hash)
    return user


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

    await _check_password_history(db, user.id, new_password)
    new_hash = hash_password(new_password)
    await _save_password_history(db, user.id, new_hash)
    user.password_hash = new_hash
    user.reset_token = None
    user.reset_token_expires = None


async def ensure_dev_seed_user(db: AsyncSession):
    """Create the documented example user automatically unless explicitly disabled."""
    if not settings.DEV_SEED_EXAMPLE_USER:
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
    logger.info("Created seed user: %s", user.email)
    return user
