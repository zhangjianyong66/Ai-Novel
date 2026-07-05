"""add story memory scope

Revision ID: c2f7a9d4e6b8
Revises: b4c7f1e9a203
Create Date: 2026-07-05 18:00:00.000000

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "c2f7a9d4e6b8"
down_revision = "b4c7f1e9a203"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = getattr(getattr(bind, "dialect", None), "name", "")

    with op.batch_alter_table("story_memories", schema=None) as batch_op:
        batch_op.add_column(sa.Column("outline_id", sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column("scope", sa.String(length=32), nullable=False, server_default="unassigned"))
        batch_op.create_foreign_key(
            "fk_story_memories_outline_id",
            "outlines",
            ["outline_id"],
            ["id"],
            ondelete="SET NULL",
        )

    op.execute(
        sa.text(
            """
            UPDATE story_memories
            SET outline_id = (
                    SELECT chapters.outline_id
                    FROM chapters
                    WHERE chapters.id = story_memories.chapter_id
                      AND chapters.project_id = story_memories.project_id
                ),
                scope = 'outline'
            WHERE chapter_id IS NOT NULL
              AND EXISTS (
                    SELECT 1
                    FROM chapters
                    WHERE chapters.id = story_memories.chapter_id
                      AND chapters.project_id = story_memories.project_id
                      AND chapters.outline_id IS NOT NULL
                )
            """
        )
    )

    op.create_index(
        "ix_story_memories_project_id_scope_outline_id",
        "story_memories",
        ["project_id", "scope", "outline_id"],
        unique=False,
    )

    if dialect != "sqlite":
        op.alter_column("story_memories", "scope", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_story_memories_project_id_scope_outline_id", table_name="story_memories")
    with op.batch_alter_table("story_memories", schema=None) as batch_op:
        batch_op.drop_constraint("fk_story_memories_outline_id", type_="foreignkey")
        batch_op.drop_column("scope")
        batch_op.drop_column("outline_id")
