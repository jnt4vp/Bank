"""enforce transactions.user_id references users.id

Revision ID: 20260306_0006
Revises: 20260306_0005
Create Date: 2026-03-06 00:30:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "20260306_0006"
down_revision: Union[str, None] = "20260306_0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE transactions
        ADD CONSTRAINT fk_transactions_user_id_users
        FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID
        """
    )


def downgrade() -> None:
    op.drop_constraint("fk_transactions_user_id_users", "transactions", type_="foreignkey")
