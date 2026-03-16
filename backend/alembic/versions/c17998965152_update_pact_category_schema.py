"""update pact category schema

Revision ID: f857511eed01
Revises: 20260309_0008
Create Date: 2026-03-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f857511eed01"
down_revision: Union[str, Sequence[str], None] = "20260309_0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("pacts", sa.Column("preset_category", sa.String(), nullable=True))
    op.add_column("pacts", sa.Column("custom_category", sa.String(), nullable=True))
    op.add_column("pacts", sa.Column("category", sa.String(), nullable=True))

    op.execute("UPDATE pacts SET category = title WHERE title IS NOT NULL")

    op.alter_column("pacts", "category", nullable=False)

    op.drop_column("pacts", "reason")
    op.drop_column("pacts", "goal")
    op.drop_column("pacts", "title")


def downgrade() -> None:
    op.add_column("pacts", sa.Column("title", sa.String(), nullable=True))
    op.add_column("pacts", sa.Column("reason", sa.String(), nullable=True))
    op.add_column("pacts", sa.Column("goal", sa.String(), nullable=True))

    op.execute("UPDATE pacts SET title = category WHERE category IS NOT NULL")

    op.drop_column("pacts", "category")
    op.drop_column("pacts", "custom_category")
    op.drop_column("pacts", "preset_category")