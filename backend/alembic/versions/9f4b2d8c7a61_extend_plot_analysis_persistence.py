"""extend plot analysis persistence

Revision ID: 9f4b2d8c7a61
Revises: f3a1b2c4d5e6
Create Date: 2026-07-07 16:45:00.000000

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "9f4b2d8c7a61"
down_revision = "f3a1b2c4d5e6"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c.get("name") for c in inspector.get_columns(table)}
    return column in cols


def upgrade() -> None:
    with op.batch_alter_table("plot_analysis", schema=None) as batch_op:
        if not _has_column("plot_analysis", "generation_run_id"):
            batch_op.add_column(sa.Column("generation_run_id", sa.String(length=36), nullable=True))
        if not _has_column("plot_analysis", "chapter_content_hash"):
            batch_op.add_column(sa.Column("chapter_content_hash", sa.String(length=64), nullable=True))
        if not _has_column("plot_analysis", "chapter_active_version_id"):
            batch_op.add_column(sa.Column("chapter_active_version_id", sa.String(length=36), nullable=True))
        if not _has_column("plot_analysis", "apply_status"):
            batch_op.add_column(sa.Column("apply_status", sa.String(length=32), nullable=False, server_default="success"))
        if not _has_column("plot_analysis", "apply_error_json"):
            batch_op.add_column(sa.Column("apply_error_json", sa.Text(), nullable=True))
        if not _has_column("plot_analysis", "updated_at"):
            batch_op.add_column(sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))

    bind = op.get_bind()
    bind.execute(sa.text("UPDATE plot_analysis SET updated_at = created_at WHERE updated_at IS NULL"))

    with op.batch_alter_table("plot_analysis", schema=None) as batch_op:
        batch_op.alter_column("updated_at", existing_type=sa.DateTime(timezone=True), nullable=False)
        batch_op.alter_column("apply_status", existing_type=sa.String(length=32), server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("plot_analysis", schema=None) as batch_op:
        batch_op.drop_column("updated_at")
        batch_op.drop_column("apply_error_json")
        batch_op.drop_column("apply_status")
        batch_op.drop_column("chapter_active_version_id")
        batch_op.drop_column("chapter_content_hash")
        batch_op.drop_column("generation_run_id")
