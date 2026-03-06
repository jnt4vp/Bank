"""add password reset token fields to users

Revision ID: 20260306_0005
Revises: 789be7042d70
Create Date: 2026-03-06 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260306_0005"
down_revision: Union[str, None] = "789be7042d70"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("reset_token", sa.String(128), nullable=True))
    op.add_column("users", sa.Column("reset_token_expires", sa.DateTime(), nullable=True))
    op.create_index("ix_users_reset_token", "users", ["reset_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_reset_token", table_name="users")
    op.drop_column("users", "reset_token_expires")
    op.drop_column("users", "reset_token")
