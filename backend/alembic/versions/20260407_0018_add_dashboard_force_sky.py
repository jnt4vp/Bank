"""add user dashboard_force_sky (API-only preference)

Revision ID: 20260407_0018
Revises: 20260407_0017
Create Date: 2026-04-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260407_0018"
down_revision: Union[str, None] = "20260407_0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "dashboard_force_sky",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.alter_column("users", "dashboard_force_sky", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "dashboard_force_sky")
