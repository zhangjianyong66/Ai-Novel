"""add chapter generation instruction preferences

Revision ID: a2f4d6c8e901
Revises: 5d6c1e7a2b4f
Create Date: 2026-07-02 11:35:00.000000

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "a2f4d6c8e901"
down_revision = "5d6c1e7a2b4f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_chapter_generation_instruction_preferences",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("value", sa.String(length=4000), nullable=False),
        sa.Column("use_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "project_id",
            "user_id",
            "value",
            name="uq_project_chapter_generation_instruction_preferences_value",
        ),
    )
    op.create_index(
        "ix_project_chapter_generation_instruction_preferences_lookup",
        "project_chapter_generation_instruction_preferences",
        ["project_id", "user_id", "updated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_project_chapter_generation_instruction_preferences_lookup",
        table_name="project_chapter_generation_instruction_preferences",
    )
    op.drop_table("project_chapter_generation_instruction_preferences")
