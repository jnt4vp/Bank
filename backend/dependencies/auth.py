from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models.user import User
from ..repositories.users import get_user_by_id
from ..services.auth import InvalidTokenError, decode_access_token_subject

bearer_scheme = HTTPBearer(auto_error=False)


def _credentials_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _credentials_exception()

    try:
        user_id = decode_access_token_subject(credentials.credentials)
    except InvalidTokenError as exc:
        raise _credentials_exception() from exc

    user = await get_user_by_id(db, user_id)
    if user is None:
        raise _credentials_exception()

    return user
