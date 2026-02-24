from uuid import UUID
from pydantic import BaseModel, EmailStr

from .user import UserResponse


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: UUID | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(Token):
    user: UserResponse
