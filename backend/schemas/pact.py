from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class PactBase(BaseModel):
    template_id: Optional[str] = Field(default=None, max_length=100)
    title: str = Field(..., max_length=255)
    reason: Optional[str] = None
    goal: Optional[str] = Field(default=None, max_length=255)
    status: Optional[str] = Field(default="active", max_length=50)


class PactCreate(PactBase):
    user_id: UUID


class PactUpdate(BaseModel):
    template_id: Optional[str] = Field(default=None, max_length=100)
    title: Optional[str] = Field(default=None, max_length=255)
    reason: Optional[str] = None
    goal: Optional[str] = Field(default=None, max_length=255)
    status: Optional[str] = Field(default=None, max_length=50)


class PactResponse(PactBase):
    id: UUID
    user_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True