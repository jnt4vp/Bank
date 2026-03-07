"""store users.reset_token_expires with timezone information

Revision ID: 20260307_0007
Revises: 20260306_0006
Create Date: 2026-03-07 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260307_0007"
down_revision: Union[str, None] = "20260306_0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "users",
        "reset_token_expires",
        existing_type=sa.DateTime(),
        type_=sa.DateTime(timezone=True),
        existing_nullable=True,
        postgresql_using="reset_token_expires AT TIME ZONE 'UTC'",
    )


def downgrade() -> None:
    op.alter_column(
        "users",
        "reset_token_expires",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(),
        existing_nullable=True,
        postgresql_using="reset_token_expires AT TIME ZONE 'UTC'",
    )
