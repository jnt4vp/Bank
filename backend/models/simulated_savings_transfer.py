"""
Persisted record of a demo-only "savings transfer" (no ACH / Plaid money movement).

Replaceable later with a real transfer provider: keep business logic in
`services.simulated_savings_transfers` behind the same triggers as today.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SimulatedSavingsTransfer(Base):
    """
    One row per (qualifying flagged transaction, pact) when savings % accountability applies.
    All rows use transfer_type='simulated' for UI and future migration to live rails.
    """

    __tablename__ = "simulated_savings_transfers"
    __table_args__ = (
        UniqueConstraint(
            "source_transaction_id",
            "pact_id",
            name="uq_simulated_savings_txn_pact",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("transactions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    pact_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pacts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="completed")
    transfer_type: Mapped[str] = mapped_column(
        String(32), nullable=False, default="simulated"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
