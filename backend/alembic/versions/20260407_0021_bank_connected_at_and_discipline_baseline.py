"""bank_connected_at + discipline baseline for users with Plaid

Revision ID: 20260407_0021
Revises: 20260407_0020
Create Date: 2026-04-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260407_0021"
down_revision: Union[str, None] = "20260407_0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "bank_connected_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    op.execute(
        """
        UPDATE users u
        SET bank_connected_at = sub.first_link
        FROM (
            SELECT user_id, MIN(created_at) AS first_link
            FROM plaid_items
            GROUP BY user_id
        ) AS sub
        WHERE u.id = sub.user_id AND u.bank_connected_at IS NULL
        """
    )

    # Baseline discipline scoring at migration time for users who linked a bank:
    # historical imported rows stay in DB but fall before this cutoff (created_at).
    op.execute(
        """
        UPDATE users
        SET discipline_score_started_at = NOW() AT TIME ZONE 'utc'
        WHERE bank_connected_at IS NOT NULL
        """
    )

    # Users who have never connected a bank: neutral window (no scored activity yet).
    op.execute(
        """
        UPDATE users
        SET discipline_score_started_at = NULL
        WHERE bank_connected_at IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("users", "bank_connected_at")
