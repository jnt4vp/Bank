import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class GoalLlmTxnCache(Base):
    """Persists final LLM goal assignment per transaction and calendar window.

    Avoids re-calling Ollama when the user only adds goals or changes limits: once a txn
    was classified for (user, period), we reuse the stored key (or explicit no-match NULL).
    """

    __tablename__ = "goal_llm_txn_cache"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "transaction_id",
            "period_start",
            "period_end",
            name="uq_goal_llm_txn_cache_user_txn_period",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("transactions.id", ondelete="CASCADE"),
        index=True,
    )
    period_start: Mapped[date] = mapped_column(Date(), nullable=False)
    period_end: Mapped[date] = mapped_column(Date(), nullable=False)
    # Lowercase goal key matching GoalSpec.key; NULL = LLM returned no goal for this txn.
    resolved_goal_key: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Hash of sorted goal names; when goals change, NULL-only rows are re-sent to the LLM.
    goals_fingerprint: Mapped[str] = mapped_column(String(32), nullable=False, default="")
