"""Create counter table."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260225_0002"
down_revision: Union[str, None] = "20260224_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "counter",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("value", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    # Seed the single counter row
    op.execute("INSERT INTO counter (id, value) VALUES (1, 0)")


def downgrade() -> None:
    op.drop_table("counter")
