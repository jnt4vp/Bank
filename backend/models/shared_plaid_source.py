import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SharedPlaidSource(Base):
    """A shared Plaid sandbox item that many users subscribe to for the demo-bank flow.

    Only the access_token lives here; per-subscriber accounts/transactions are cloned
    onto regular PlaidItem rows whose shared_source_id points at this source.
    """

    __tablename__ = "shared_plaid_sources"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    item_id: Mapped[str] = mapped_column(String(255), unique=True)
    access_token: Mapped[str] = mapped_column(Text)
    institution_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
