"""replace users.card_locked bool with users.card_locked_until timestamp

Revision ID: 20260430_0028
Revises: 20260422_0027
Create Date: 2026-04-30
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260430_0028"
down_revision: Union[str, None] = "20260422_0027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("card_locked_until", sa.DateTime(timezone=True), nullable=True),
    )
    # Carry forward any currently-locked users by giving them a 1h window from now.
    op.execute(
        "UPDATE users SET card_locked_until = NOW() + INTERVAL '1 hour' "
        "WHERE card_locked = TRUE"
    )
    op.drop_column("users", "card_locked")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "card_locked",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.execute(
        "UPDATE users SET card_locked = TRUE WHERE card_locked_until > NOW()"
    )
    op.alter_column("users", "card_locked", server_default=None)
    op.drop_column("users", "card_locked_until")
