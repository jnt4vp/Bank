from datetime import datetime, timezone
from uuid import UUID
from typing import Optional

from pydantic import BaseModel, model_validator


class PactCreate(BaseModel):
    user_id: Optional[UUID] = None
    preset_category: Optional[str] = None
    custom_category: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = "active"
    locked_until: Optional[datetime] = None

    @model_validator(mode="after")
    def set_category(self):
        preset = self.preset_category.strip() if self.preset_category else None
        custom = self.custom_category.strip() if self.custom_category else None

        # Reject requests that try to set both sources on one row
        if preset and custom:
            raise ValueError("Provide either preset_category or custom_category, not both.")

        self.category = custom or preset

        if not self.category:
            raise ValueError("A preset category or custom category is required.")

        if self.locked_until and self.locked_until <= datetime.now(timezone.utc):
            raise ValueError("locked_until must be a future datetime")

        return self


class PactUpdate(BaseModel):
    preset_category: Optional[str] = None
    custom_category: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    locked_until: Optional[datetime] = None

    @model_validator(mode="after")
    def set_category(self):
        preset = self.preset_category.strip() if self.preset_category else None
        custom = self.custom_category.strip() if self.custom_category else None

        if custom or preset:
            self.category = custom or preset

        if self.locked_until and self.locked_until <= datetime.now(timezone.utc):
            raise ValueError("locked_until must be a future datetime")

        return self


class PactResponse(BaseModel):
    id: UUID
    user_id: UUID
    preset_category: Optional[str] = None
    custom_category: Optional[str] = None
    category: str
    status: str
    locked_until: Optional[datetime] = None

    class Config:
        from_attributes = True