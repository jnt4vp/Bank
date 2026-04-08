from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator


class SimulatedSavingsTransferItem(BaseModel):
    """One demo ledger row; not a bank transfer."""

    id: UUID
    user_id: UUID
    source_transaction_id: UUID
    pact_id: UUID | None
    amount: float
    status: str
    transfer_type: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_validator("amount", mode="before")
    @classmethod
    def _coerce_amount(cls, value: object) -> float:
        return float(value)


class SimulatedSavingsTransfersSummary(BaseModel):
    """Dashboard payload: recorded demo transfers + flag for UI copy."""

    simulated_transfers_enabled: bool
    total_recorded: float
    transfers: list[SimulatedSavingsTransferItem]
