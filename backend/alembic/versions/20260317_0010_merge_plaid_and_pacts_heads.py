"""merge plaid and pacts heads

Revision ID: 20260317_0010
Revises: 1586652943b7, 20260316_0009
Create Date: 2026-03-17
"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "20260317_0010"
down_revision: Union[str, Sequence[str], None] = ("1586652943b7", "20260316_0009")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
