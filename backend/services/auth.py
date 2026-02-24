from datetime import datetime, timedelta, timezone
from uuid import UUID

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
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire_at = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    to_encode.update({"exp": expire_at})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token_subject(token: str) -> UUID:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise InvalidTokenError
        token_data = TokenData(user_id=UUID(user_id))
        if token_data.user_id is None:
            raise InvalidTokenError
        return token_data.user_id
    except (JWTError, ValueError, TypeError) as exc:
        raise InvalidTokenError from exc


async def register_user(db: AsyncSession, user_data: UserCreate):
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
    user = await get_user_by_email(db, email)
    if not user or not verify_password(password, user.password_hash):
        raise InvalidCredentialsError
    return user
