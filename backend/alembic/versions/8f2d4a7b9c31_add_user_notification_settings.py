"""add user notification settings

Revision ID: 8f2d4a7b9c31
Revises: b7c4f2e6a901
Create Date: 2026-07-01 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "8f2d4a7b9c31"
down_revision: Union[str, None] = "b7c4f2e6a901"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_notification_settings",
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("browser_enabled", sa.Boolean(), nullable=False),
        sa.Column("feishu_enabled", sa.Boolean(), nullable=False),
        sa.Column("feishu_webhook_ciphertext", sa.Text(), nullable=True),
        sa.Column("feishu_webhook_masked", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("user_notification_settings")
