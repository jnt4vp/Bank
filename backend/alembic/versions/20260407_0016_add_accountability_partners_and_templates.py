"""add accountability partners and alert templates

Revision ID: 20260407_0016
Revises: 20260407_0015
Create Date: 2026-04-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "20260407_0016"
down_revision: Union[str, None] = "20260407_0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column(
            "accountability_alert_sent",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "transactions",
        sa.Column("accountability_alert_sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.alter_column("transactions", "accountability_alert_sent", server_default=None)

    op.create_table(
        "accountability_partners",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("partner_name", sa.String(length=120), nullable=True),
        sa.Column("partner_email", sa.String(length=255), nullable=False),
        sa.Column("relationship_label", sa.String(length=80), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "partner_email", name="uq_accountability_partner_user_email"),
    )
    op.create_index("ix_accountability_partners_user_id", "accountability_partners", ["user_id"])

    op.create_table(
        "accountability_alert_settings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("alerts_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("custom_subject_template", sa.Text(), nullable=True),
        sa.Column("custom_body_template", sa.Text(), nullable=True),
        sa.Column("custom_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_accountability_alert_settings_user_id", "accountability_alert_settings", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_accountability_alert_settings_user_id", table_name="accountability_alert_settings")
    op.drop_table("accountability_alert_settings")
    op.drop_index("ix_accountability_partners_user_id", table_name="accountability_partners")
    op.drop_table("accountability_partners")
    op.drop_column("transactions", "accountability_alert_sent_at")
    op.drop_column("transactions", "accountability_alert_sent")
