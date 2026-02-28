from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class TransactionCreate(BaseModel):
    user_id: UUID
    merchant: str
    description: str
    amount: float


class TransactionResponse(BaseModel):
    id: UUID
    user_id: UUID
    merchant: str
    description: str
    amount: float
    category: str | None
    flagged: bool
    flag_reason: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
