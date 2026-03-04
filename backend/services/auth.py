from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..repositories.users import create_user, get_user_by_email
from ..schemas.auth import TokenData
from ..schemas.user import UserCreate

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class DuplicateEmailError(Exception):
    """Raised when attempting to register an existing email."""


class InvalidCredentialsError(Exception):
    """Raised when login credentials are invalid."""


class InvalidTokenError(Exception):
    """Raised when a bearer token cannot be validated."""


def hash_password(password: str) -> str:
    """Hash a plaintext password for storage.

    bcrypt only supports passwords up to 72 bytes. Enforce this to avoid 500s.
    """
    if len(password.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Password must be 72 bytes or less.")
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a stored hash.

    If the password is longer than bcrypt supports, treat it as invalid rather than crashing.
    """
    if len(plain_password.encode("utf-8")) > 72:
        return False
    return pwd_context.verify(plain_password, hashed_password)


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