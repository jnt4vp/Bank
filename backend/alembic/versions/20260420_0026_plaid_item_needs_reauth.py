"""plaid_items.needs_reauth flag to park items stuck in ITEM_LOGIN_REQUIRED

Revision ID: 20260420_0026
Revises: 20260420_0025
Create Date: 2026-04-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260420_0026"
down_revision: Union[str, None] = "20260420_0025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "plaid_items",
        sa.Column(
            "needs_reauth",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.alter_column("plaid_items", "needs_reauth", server_default=None)


def downgrade() -> None:
    op.drop_column("plaid_items", "needs_reauth")
