from datetime import datetime, timezone
from uuid import UUID
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field, field_validator


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: str | None = None


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=20)
    discipline_savings_percentage: float | None = Field(default=None, ge=0, le=100)
    discipline_ui_mode: str | None = None
    dashboard_force_sky: bool | None = None
    reset_discipline_window: bool | None = Field(
        default=None,
        description="When true, moves the discipline scoring window to now and recomputes score.",
    )
    card_locked: bool | None = Field(
        default=None,
        description="When true, locks the card until the configured duration; when false, clears an active lock.",
    )
    card_lock_auto_enabled: bool | None = Field(
        default=None,
        description="When false, pact violations no longer extend the automatic card lock.",
    )


class UserResponse(BaseModel):
    id: UUID
    email: str
    phone: str | None
    name: str
    card_locked_until: Optional[datetime] = None
    discipline_savings_percentage: float
    discipline_score: int = 100
    discipline_ui_mode: str = "discipline"
    dashboard_force_sky: bool = False
    card_lock_auto_enabled: bool = True
    discipline_score_started_at: Optional[datetime] = None
    bank_connected_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def card_locked(self) -> bool:
        if self.card_locked_until is None:
            return False
        return self.card_locked_until > datetime.now(timezone.utc)

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
