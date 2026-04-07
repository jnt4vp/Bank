"""add alert tracking fields to transactions

Revision ID: 20260407_0015
Revises: 20260323_0014
Create Date: 2026-04-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260407_0015"
down_revision: Union[str, None] = "20260323_0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("alert_sent", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "transactions",
        sa.Column("alert_sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.alter_column("transactions", "alert_sent", server_default=None)


def downgrade() -> None:
    op.drop_column("transactions", "alert_sent_at")
    op.drop_column("transactions", "alert_sent")
