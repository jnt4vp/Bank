from pydantic import BaseModel, Field
from typing import Optional


class AccountabilitySettingsCreate(BaseModel):
    accountability_type: str
    discipline_savings_percentage: float = Field(ge=0, le=100)
    accountability_note: Optional[str] = None


class AccountabilitySettingsOut(BaseModel):
    accountability_type: str
    accountability_note: Optional[str] = None
    discipline_savings_percentage: float

    class Config:
        from_attributes = True
        