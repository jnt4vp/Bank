from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class AccountabilityPartnerCreate(BaseModel):
    partner_name: str | None = Field(default=None, max_length=120)
    partner_email: EmailStr
    relationship_label: str | None = Field(default=None, max_length=80)
    is_active: bool = True


class AccountabilityPartnerUpdate(BaseModel):
    partner_name: str | None = Field(default=None, max_length=120)
    partner_email: EmailStr
    relationship_label: str | None = Field(default=None, max_length=80)
    is_active: bool


class AccountabilityPartnerOut(BaseModel):
    id: UUID
    partner_name: str | None
    partner_email: EmailStr
    relationship_label: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AccountabilityAlertSettingsUpdate(BaseModel):
    alerts_enabled: bool = True
    custom_subject_template: str | None = Field(default=None, max_length=500)
    custom_body_template: str | None = Field(default=None, max_length=4000)
    custom_message: str | None = Field(default=None, max_length=1000)


class AccountabilityAlertSettingsOut(BaseModel):
    alerts_enabled: bool
    custom_subject_template: str | None = None
    custom_body_template: str | None = None
    custom_message: str | None = None

