from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: str | None = None


class UserUpdate(BaseModel):
    discipline_savings_percentage: float = Field(ge=0, le=100)


class UserResponse(BaseModel):
    id: UUID
    email: str
    phone: str | None
    name: str
    card_locked: bool
    discipline_savings_percentage: float
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
