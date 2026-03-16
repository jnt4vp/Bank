from uuid import UUID
from typing import Optional

from pydantic import BaseModel, model_validator


class PactCreate(BaseModel):
    user_id: UUID
    preset_category: Optional[str] = None
    custom_category: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = "active"

    @model_validator(mode="after")
    def set_category(self):
        preset = self.preset_category.strip() if self.preset_category else None
        custom = self.custom_category.strip() if self.custom_category else None

        self.category = custom or preset

        if not self.category:
            raise ValueError("A preset category or custom category is required.")

        return self


class PactUpdate(BaseModel):
    preset_category: Optional[str] = None
    custom_category: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None

    @model_validator(mode="after")
    def set_category(self):
        preset = self.preset_category.strip() if self.preset_category else None
        custom = self.custom_category.strip() if self.custom_category else None

        if custom or preset:
            self.category = custom or preset

        return self


class PactResponse(BaseModel):
    id: UUID
    user_id: UUID
    preset_category: Optional[str] = None
    custom_category: Optional[str] = None
    category: str
    status: str

    class Config:
        from_attributes = True