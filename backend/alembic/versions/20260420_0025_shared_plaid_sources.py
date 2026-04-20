"""shared demo plaid source + fan-out scoping

Revision ID: 20260420_0025
Revises: 20260412_0024
Create Date: 2026-04-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260420_0025"
down_revision: Union[str, None] = "20260412_0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "shared_plaid_sources",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("item_id", sa.String(length=255), nullable=False, unique=True),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("institution_name", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.add_column(
        "plaid_items",
        sa.Column("shared_source_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_plaid_items_shared_source_id",
        "plaid_items",
        ["shared_source_id"],
    )
    op.create_foreign_key(
        "plaid_items_shared_source_id_fkey",
        "plaid_items",
        "shared_plaid_sources",
        ["shared_source_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.alter_column("plaid_items", "access_token", existing_type=sa.Text(), nullable=True)

    # accounts.plaid_account_id: global-unique -> composite (plaid_item_id, plaid_account_id).
    # Multiple subscribers now clone the same Plaid account; each gets their own row.
    op.drop_constraint("accounts_plaid_account_id_key", "accounts", type_="unique")
    op.create_unique_constraint(
        "uq_accounts_item_plaid_account",
        "accounts",
        ["plaid_item_id", "plaid_account_id"],
    )

    # transactions.plaid_transaction_id: global-unique -> composite (user_id, plaid_transaction_id).
    op.drop_constraint(
        "transactions_plaid_transaction_id_key", "transactions", type_="unique"
    )
    op.create_unique_constraint(
        "uq_transactions_user_plaid_txn",
        "transactions",
        ["user_id", "plaid_transaction_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_transactions_user_plaid_txn", "transactions", type_="unique")
    op.create_unique_constraint(
        "transactions_plaid_transaction_id_key",
        "transactions",
        ["plaid_transaction_id"],
    )

    op.drop_constraint("uq_accounts_item_plaid_account", "accounts", type_="unique")
    op.create_unique_constraint(
        "accounts_plaid_account_id_key", "accounts", ["plaid_account_id"]
    )

    op.alter_column("plaid_items", "access_token", existing_type=sa.Text(), nullable=False)

    op.drop_constraint(
        "plaid_items_shared_source_id_fkey", "plaid_items", type_="foreignkey"
    )
    op.drop_index("ix_plaid_items_shared_source_id", table_name="plaid_items")
    op.drop_column("plaid_items", "shared_source_id")

    op.drop_table("shared_plaid_sources")
