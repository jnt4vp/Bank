from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional


class AccountabilitySettingsCreate(BaseModel):
    pact_id: UUID
    accountability_type: str
    discipline_savings_percentage: float = Field(ge=0, le=100)
    accountability_note: Optional[str] = None
    accountability_partner_ids: list[UUID] = Field(default_factory=list)


class AccountabilitySettingsOut(BaseModel):
    id: UUID
    pact_id: UUID
    accountability_type: str
    accountability_note: Optional[str] = None
    discipline_savings_percentage: float
    accountability_partner_ids: list[UUID] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
