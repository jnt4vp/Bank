"""users.card_lock_auto_enabled — optional automatic lock on pact violation

Revision ID: 20260501_0029
Revises: 20260430_0028
Create Date: 2026-05-01
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260501_0029"
down_revision: Union[str, None] = "20260430_0028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "card_lock_auto_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.alter_column("users", "card_lock_auto_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "card_lock_auto_enabled")
