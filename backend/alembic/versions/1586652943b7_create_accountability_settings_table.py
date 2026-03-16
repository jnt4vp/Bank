"""create accountability settings table

Revision ID: 1586652943b7
Revises: c17998965152
Create Date: 2026-03-16 16:54:17.753318
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "1586652943b7"
down_revision: Union[str, None] = "c17998965152"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "accountability_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("pact_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("accountability_type", sa.String(), nullable=False),
        sa.Column("discipline_savings_percentage", sa.Float(), nullable=False),
        sa.Column("accountability_note", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["pact_id"], ["pacts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("pact_id"),
    )


def downgrade() -> None:
    op.drop_table("accountability_settings")