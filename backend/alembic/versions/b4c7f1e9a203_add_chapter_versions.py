"""add chapter versions

Revision ID: b4c7f1e9a203
Revises: a2f4d6c8e901
Create Date: 2026-07-05 22:00:00.000000

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "b4c7f1e9a203"
down_revision = "a2f4d6c8e901"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chapter_versions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("project_id", sa.String(length=36), nullable=False),
        sa.Column("chapter_id", sa.String(length=36), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("content_md", sa.Text(), nullable=False),
        sa.Column("word_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("generation_run_id", sa.String(length=36), nullable=True),
        sa.Column("provider", sa.String(length=64), nullable=True),
        sa.Column("model", sa.String(length=255), nullable=True),
        sa.Column("meta_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chapter_versions_chapter_id_created_at", "chapter_versions", ["chapter_id", "created_at"], unique=False)
    op.create_index("ix_chapter_versions_project_id", "chapter_versions", ["project_id"], unique=False)

    with op.batch_alter_table("chapters", schema=None) as batch_op:
        batch_op.add_column(sa.Column("active_version_id", sa.String(length=36), nullable=True))
        batch_op.create_foreign_key(
            "fk_chapters_active_version_id_chapter_versions",
            "chapter_versions",
            ["active_version_id"],
            ["id"],
            ondelete="SET NULL",
        )
    op.create_index("ix_chapters_active_version_id", "chapters", ["active_version_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_chapters_active_version_id", table_name="chapters")
    with op.batch_alter_table("chapters", schema=None) as batch_op:
        batch_op.drop_constraint("fk_chapters_active_version_id_chapter_versions", type_="foreignkey")
        batch_op.drop_column("active_version_id")

    op.drop_index("ix_chapter_versions_project_id", table_name="chapter_versions")
    op.drop_index("ix_chapter_versions_chapter_id_created_at", table_name="chapter_versions")
    op.drop_table("chapter_versions")
