from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

import bcrypt
from fastapi import HTTPException
from jose import JWTError, jwt
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..repositories.users import create_user, get_user_by_email, get_user_by_reset_token
from ..schemas.auth import TokenData
from ..schemas.user import UserCreate

settings = get_settings()
logger = logging.getLogger("bank.auth")


class DuplicateEmailError(Exception):
    """Raised when attempting to register an existing email."""


class InvalidCredentialsError(Exception):
    """Raised when login credentials are invalid."""


class InvalidTokenError(Exception):
    """Raised when a bearer token cannot be validated."""


class InvalidResetTokenError(Exception):
    """Raised when a reset token is invalid or expired."""


def hash_password(password: str) -> str:
    """Hash a plaintext password for storage.

    bcrypt only supports passwords up to 72 bytes. Enforce this to avoid 500s.
    """
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > 72:
        raise HTTPException(status_code=400, detail="Password must be 72 bytes or less.")
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a stored hash.

    If the password is longer than bcrypt supports, treat it as invalid rather than crashing.
    """
    password_bytes = plain_password.encode("utf-8")
    if len(password_bytes) > 72:
        return False
    try:
        return bcrypt.checkpw(password_bytes, hashed_password.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(data: dict) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    expire_at = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    to_encode.update({"exp": expire_at})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token_subject(token: str) -> UUID:
    """Decode a JWT and return the user_id (sub)."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        sub = payload.get("sub")
        if not sub:
            raise InvalidTokenError
        user_id = UUID(str(sub))
        _ = TokenData(user_id=user_id)
        return user_id
    except (JWTError, ValueError, TypeError) as exc:
        raise InvalidTokenError from exc


async def register_user(db: AsyncSession, user_data: UserCreate):
    """Register a new user (hashes password before storing)."""
    existing_user = await get_user_by_email(db, user_data.email)
    if existing_user:
        raise DuplicateEmailError

    try:
        return await create_user(
            db,
            email=user_data.email,
            password_hash=hash_password(user_data.password),
            name=user_data.name,
            phone=user_data.phone,
        )
    except IntegrityError as exc:
        raise DuplicateEmailError from exc


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
    user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
    await db.commit()
    return token


async def reset_password(db: AsyncSession, token: str, new_password: str) -> None:
    """Validate the reset token and update the user's password."""
    user = await get_user_by_reset_token(db, token)
    if not user or not user.reset_token_expires:
        raise InvalidResetTokenError

    expires = user.reset_token_expires
    if expires < datetime.utcnow():
        raise InvalidResetTokenError

    if not new_password.strip():
        raise HTTPException(
            status_code=400,
            detail="Password is required",
        )

    if len(new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters",
        )

    user.password_hash = hash_password(new_password)
    user.reset_token = None
    user.reset_token_expires = None
    await db.commit()


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