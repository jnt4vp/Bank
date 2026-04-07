from datetime import datetime
from uuid import UUID
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: str | None = None


class UserUpdate(BaseModel):
    discipline_savings_percentage: float | None = Field(default=None, ge=0, le=100)
    discipline_ui_mode: str | None = None
    dashboard_force_sky: bool | None = None
    reset_discipline_window: bool | None = Field(
        default=None,
        description="When true, moves the discipline scoring window to now and recomputes score.",
    )


class UserResponse(BaseModel):
    id: UUID
    email: str
    phone: str | None
    name: str
    card_locked: bool
    discipline_savings_percentage: float
    discipline_score: int = 100
    discipline_ui_mode: str = "discipline"
    dashboard_force_sky: bool = False
    discipline_score_started_at: Optional[datetime] = None
    bank_connected_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_validator("discipline_score", mode="before")
    @classmethod
    def normalize_discipline_score(cls, value: object) -> int:
        if value is None:
            return 100
        return int(value)

    @field_validator("discipline_ui_mode", mode="before")
    @classmethod
    def normalize_discipline_ui_mode(cls, value: object) -> str:
        if value is None or value == "":
            return "discipline"
        return str(value).strip().lower()
