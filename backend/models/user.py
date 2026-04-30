import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    name: Mapped[str] = mapped_column(String(100))
    card_locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    discipline_savings_percentage: Mapped[float] = mapped_column(
        Numeric(5, 2), default=0, server_default="0"
    )
    discipline_score: Mapped[int] = mapped_column(Integer, default=100, server_default="100")
    discipline_score_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
    bank_connected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )
    discipline_ui_mode: Mapped[str] = mapped_column(String(32), default="discipline", server_default="discipline")
    dashboard_force_sky: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    reset_token: Mapped[str | None] = mapped_column(
        String(128), nullable=True, unique=True, index=True
    )
    reset_token_expires: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    pacts = relationship(
        "Pact",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    password_history = relationship(
        "PasswordHistory",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="PasswordHistory.created_at.desc()",
    )

    @property
    def card_locked(self) -> bool:
        if self.card_locked_until is None:
            return False
        return self.card_locked_until > datetime.now(timezone.utc)
