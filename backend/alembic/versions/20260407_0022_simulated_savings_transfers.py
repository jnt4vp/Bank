"""simulated savings transfers (demo-only ledger)

Revision ID: 20260407_0022
Revises: 20260407_0021
Create Date: 2026-04-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260407_0022"
down_revision: Union[str, None] = "20260407_0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "simulated_savings_transfers",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("source_transaction_id", sa.UUID(), nullable=False),
        sa.Column("pact_id", sa.UUID(), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("transfer_type", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["pact_id"], ["pacts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["source_transaction_id"], ["transactions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_transaction_id",
            "pact_id",
            name="uq_simulated_savings_txn_pact",
        ),
    )
    op.create_index(
        op.f("ix_simulated_savings_transfers_user_id"),
        "simulated_savings_transfers",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_simulated_savings_transfers_source_transaction_id"),
        "simulated_savings_transfers",
        ["source_transaction_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_simulated_savings_transfers_pact_id"),
        "simulated_savings_transfers",
        ["pact_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_simulated_savings_transfers_pact_id"),
        table_name="simulated_savings_transfers",
    )
    op.drop_index(
        op.f("ix_simulated_savings_transfers_source_transaction_id"),
        table_name="simulated_savings_transfers",
    )
    op.drop_index(
        op.f("ix_simulated_savings_transfers_user_id"),
        table_name="simulated_savings_transfers",
    )
    op.drop_table("simulated_savings_transfers")
