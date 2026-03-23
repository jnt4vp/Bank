from __future__ import annotations

import re
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


_WEAK_PASSWORDS = {
    "password", "password1", "password123", "password1234",
    "123456", "1234567", "12345678", "123456789", "1234567890",
    "qwerty", "qwerty123", "qwertyuiop",
    "letmein", "welcome", "welcome1", "iloveyou",
    "admin", "admin123", "admin1234",
    "monkey", "dragon", "master", "sunshine", "princess",
    "shadow", "superman", "michael", "football", "baseball",
    "abc123", "abcdef", "1q2w3e4r", "trustno1", "starwars",
    "hello123", "batman", "login", "access", "flower",
    "mustang", "whatever", "test1234", "pass1234", "pass123",
}

_SPECIAL_CHARS = re.compile(r'[!@#$%^&*()\-_=+\[\]{};:\'",.<>/?\\|`~]')


def validate_password(password: str, *, email: str | None = None) -> None:
    if not password.strip():
        raise PasswordValidationError("Password is required")

    if len(password) < 8:
        raise PasswordValidationError("Password must be at least 8 characters")

    password_bytes = password.encode("utf-8")
    if len(password_bytes) > 72:
        raise PasswordValidationError("Password must be 72 bytes or less.")

    if not re.search(r"[A-Z]", password):
        raise PasswordValidationError("Password must contain at least one uppercase letter")

    if not re.search(r"[a-z]", password):
        raise PasswordValidationError("Password must contain at least one lowercase letter")

    if not re.search(r"\d", password):
        raise PasswordValidationError("Password must contain at least one number")

    if not _SPECIAL_CHARS.search(password):
        raise PasswordValidationError("Password must contain at least one special character")

    if password.lower() in _WEAK_PASSWORDS:
        raise PasswordValidationError("This password is too common. Please choose a stronger one")

    if email:
        password_lower = password.lower()
        if password_lower == email.lower():
            raise PasswordValidationError("Password must not be the same as your email")
        email_local = email.lower().split("@")[0]
        if len(email_local) >= 4 and email_local in password_lower:
            raise PasswordValidationError("Password must not contain your email address")


def hash_password(password: str, *, email: str | None = None) -> str:
    validate_password(password, email=email)
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
