"""add plaid_items, accounts tables and plaid columns on transactions

Revision ID: 20260316_0009
Revises: 20260309_0008
Create Date: 2026-03-16
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "20260316_0009"
down_revision = "20260309_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plaid_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("item_id", sa.String(255), nullable=False, unique=True),
        sa.Column("access_token", sa.Text, nullable=False),
        sa.Column("institution_name", sa.String(255), nullable=True),
        sa.Column("transaction_cursor", sa.Text, nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "accounts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("plaid_item_id", UUID(as_uuid=True), sa.ForeignKey("plaid_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("plaid_account_id", sa.String(255), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("official_name", sa.String(255), nullable=True),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("subtype", sa.String(50), nullable=True),
        sa.Column("mask", sa.String(10), nullable=True),
        sa.Column("current_balance", sa.Numeric(12, 2), nullable=True),
        sa.Column("available_balance", sa.Numeric(12, 2), nullable=True),
        sa.Column("iso_currency_code", sa.String(10), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.add_column("transactions", sa.Column("plaid_transaction_id", sa.String(255), nullable=True))
    op.add_column("transactions", sa.Column("account_id", UUID(as_uuid=True), nullable=True))
    op.add_column("transactions", sa.Column("date", sa.Date, nullable=True))
    op.add_column("transactions", sa.Column("pending", sa.Boolean, server_default="false", nullable=False))

    op.create_unique_constraint("transactions_plaid_transaction_id_key", "transactions", ["plaid_transaction_id"])
    op.create_index("ix_transactions_account_id", "transactions", ["account_id"])
    op.create_foreign_key(
        "transactions_account_id_fkey",
        "transactions",
        "accounts",
        ["account_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("transactions_account_id_fkey", "transactions", type_="foreignkey")
    op.drop_index("ix_transactions_account_id", table_name="transactions")
    op.drop_constraint("transactions_plaid_transaction_id_key", "transactions", type_="unique")
    op.drop_column("transactions", "pending")
    op.drop_column("transactions", "date")
    op.drop_column("transactions", "account_id")
    op.drop_column("transactions", "plaid_transaction_id")
    op.drop_table("accounts")
    op.drop_table("plaid_items")
