"""add user discipline score and ui mode

Revision ID: 20260407_0017
Revises: 20260407_0016
Create Date: 2026-04-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260407_0017"
down_revision: Union[str, None] = "20260407_0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("discipline_score", sa.Integer(), nullable=False, server_default="100"),
    )
    op.add_column(
        "users",
        sa.Column("discipline_ui_mode", sa.String(length=32), nullable=False, server_default="discipline"),
    )
    op.alter_column("users", "discipline_score", server_default=None)
    op.alter_column("users", "discipline_ui_mode", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "discipline_ui_mode")
    op.drop_column("users", "discipline_score")
