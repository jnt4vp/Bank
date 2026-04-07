"""add discipline_score_started_at for forward-only scoring

Revision ID: 20260407_0019
Revises: 20260407_0018
Create Date: 2026-04-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260407_0019"
down_revision: Union[str, None] = "20260407_0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "discipline_score_started_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.alter_column("users", "discipline_score_started_at", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "discipline_score_started_at")
