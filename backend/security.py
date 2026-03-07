from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

import bcrypt
from jose import JWTError, jwt

from .config import get_settings
from .schemas.auth import TokenData


class PasswordValidationError(ValueError):
    """Raised when a password fails server-side validation."""


class InvalidTokenError(Exception):
    """Raised when a bearer token cannot be validated."""


def validate_password(password: str) -> None:
    if not password.strip():
        raise PasswordValidationError("Password is required")

    if len(password) < 8:
        raise PasswordValidationError("Password must be at least 8 characters")

    password_bytes = password.encode("utf-8")
    if len(password_bytes) > 72:
        raise PasswordValidationError("Password must be 72 bytes or less.")


def hash_password(password: str) -> str:
    validate_password(password)
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    password_bytes = plain_password.encode("utf-8")
    if len(password_bytes) > 72:
        return False

    try:
        return bcrypt.checkpw(password_bytes, hashed_password.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(data: dict) -> str:
    settings = get_settings()
    to_encode = data.copy()
    expire_at = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    to_encode.update({"exp": expire_at})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token_subject(token: str) -> UUID:
    settings = get_settings()
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
