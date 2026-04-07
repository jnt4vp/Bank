"""discipline_score_started_at nullable — window opens after first tracked activity

Revision ID: 20260407_0020
Revises: 20260407_0019
Create Date: 2026-04-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260407_0020"
down_revision: Union[str, None] = "20260407_0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "users",
        "discipline_score_started_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=True,
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE users
        SET discipline_score_started_at = COALESCE(
            discipline_score_started_at,
            created_at,
            NOW() AT TIME ZONE 'utc'
        )
        """
    )
    op.alter_column(
        "users",
        "discipline_score_started_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
    )
