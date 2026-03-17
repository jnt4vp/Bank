from datetime import date as date_type, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class TransactionCreate(BaseModel):
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
    plaid_transaction_id: str | None = None
    plaid_name: str | None = None
    plaid_merchant_name: str | None = None
    plaid_original_description: str | None = None
    date: date_type | None = None
    pending: bool = False

    model_config = ConfigDict(from_attributes=True)
