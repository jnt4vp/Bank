"""goal_llm_txn_cache for stable LLM goal assignments per period

Revision ID: 20260412_0024
Revises: 20260410_0023
Create Date: 2026-04-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260412_0024"
down_revision: Union[str, None] = "20260410_0023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "goal_llm_txn_cache",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("transaction_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("resolved_goal_key", sa.String(length=120), nullable=True),
        sa.Column("goals_fingerprint", sa.String(length=32), nullable=False, server_default=""),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "transaction_id",
            "period_start",
            "period_end",
            name="uq_goal_llm_txn_cache_user_txn_period",
        ),
    )
    op.create_index(
        op.f("ix_goal_llm_txn_cache_user_id"),
        "goal_llm_txn_cache",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_goal_llm_txn_cache_transaction_id"),
        "goal_llm_txn_cache",
        ["transaction_id"],
        unique=False,
    )
    op.alter_column("goal_llm_txn_cache", "goals_fingerprint", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_goal_llm_txn_cache_transaction_id"), table_name="goal_llm_txn_cache")
    op.drop_index(op.f("ix_goal_llm_txn_cache_user_id"), table_name="goal_llm_txn_cache")
    op.drop_table("goal_llm_txn_cache")
