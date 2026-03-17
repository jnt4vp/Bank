"""add plaid transaction text fields

Revision ID: 20260317_0011
Revises: 20260317_0010
Create Date: 2026-03-17
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260317_0011"
down_revision: Union[str, Sequence[str], None] = "20260317_0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("plaid_name", sa.Text(), nullable=True))
    op.add_column(
        "transactions",
        sa.Column("plaid_merchant_name", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "transactions",
        sa.Column("plaid_original_description", sa.Text(), nullable=True),
    )

    op.execute(
        """
        UPDATE transactions
        SET
            plaid_name = description,
            plaid_merchant_name = merchant
        WHERE plaid_transaction_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column("transactions", "plaid_original_description")
    op.drop_column("transactions", "plaid_merchant_name")
    op.drop_column("transactions", "plaid_name")
