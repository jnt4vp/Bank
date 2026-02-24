from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: str | None = None


class UserResponse(BaseModel):
    id: UUID
    email: str
    phone: str | None
    name: str
    card_locked: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserInDB(UserResponse):
    password_hash: str
