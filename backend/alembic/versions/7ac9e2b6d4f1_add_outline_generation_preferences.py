"""add outline generation preferences

Revision ID: 7ac9e2b6d4f1
Revises: c4a2b7e91d13
Create Date: 2026-07-01 15:30:00.000000

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "7ac9e2b6d4f1"
down_revision = "c4a2b7e91d13"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_outline_generation_preferences",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("field", sa.String(length=16), nullable=False),
        sa.Column("value", sa.String(length=255), nullable=False),
        sa.Column("use_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("field IN ('tone','pacing')", name="ck_project_outline_generation_preferences_field"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "user_id", "field", "value", name="uq_project_outline_generation_preferences_value"),
    )
    op.create_index(
        "ix_project_outline_generation_preferences_lookup",
        "project_outline_generation_preferences",
        ["project_id", "user_id", "field", "updated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_project_outline_generation_preferences_lookup", table_name="project_outline_generation_preferences")
    op.drop_table("project_outline_generation_preferences")
