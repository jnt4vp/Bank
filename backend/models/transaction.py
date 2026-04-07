import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        index=True,
    )
    merchant: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    flagged: Mapped[bool] = mapped_column(default=False)
    flag_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    alert_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    alert_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accountability_alert_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    accountability_alert_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # Plaid-sourced fields (nullable — null means manually created)
    plaid_transaction_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    plaid_original_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    date: Mapped[date | None] = mapped_column(Date, nullable=True)
    pending: Mapped[bool] = mapped_column(Boolean, default=False)
