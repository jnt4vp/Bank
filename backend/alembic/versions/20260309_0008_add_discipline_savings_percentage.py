"""add discipline_savings_percentage to users

Revision ID: 20260309_0008
Revises: 20260307_0007_make_reset_token_expiry_timezone_aware
Create Date: 2026-03-09
"""

from alembic import op
import sqlalchemy as sa

revision = "20260309_0008"
down_revision = "20260307_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("discipline_savings_percentage", sa.Numeric(5, 2), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("users", "discipline_savings_percentage")
