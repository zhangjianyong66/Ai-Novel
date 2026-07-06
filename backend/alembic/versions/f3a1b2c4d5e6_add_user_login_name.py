"""add user login name

Revision ID: f3a1b2c4d5e6
Revises: c2f7a9d4e6b8
Create Date: 2026-07-06 19:05:00.000000

"""

from __future__ import annotations

import re

from alembic import op
import sqlalchemy as sa


revision = "f3a1b2c4d5e6"
down_revision = "c2f7a9d4e6b8"
branch_labels = None
depends_on = None

_LOGIN_NAME_CLEAN_RE = re.compile(r"[^a-z0-9_-]+")


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c.get("name") for c in inspector.get_columns(table)}
    return column in cols


def _normalize_legacy_login_name(value: str, *, index: int) -> str:
    normalized = _LOGIN_NAME_CLEAN_RE.sub("_", str(value or "").strip().lower()).strip("_")
    if not normalized:
        normalized = f"user_{index + 1}"
    return normalized[:64]


def upgrade() -> None:
    bind = op.get_bind()
    dialect = getattr(getattr(bind, "dialect", None), "name", "")

    if not _has_column("users", "login_name"):
        with op.batch_alter_table("users", schema=None) as batch_op:
            batch_op.add_column(sa.Column("login_name", sa.String(length=64), nullable=True))

    rows = bind.execute(sa.text("SELECT id FROM users ORDER BY id")).fetchall()
    used: set[str] = set()
    for idx, row in enumerate(rows):
        user_id = str(row[0])
        base = _normalize_legacy_login_name(user_id, index=idx)
        candidate = base
        suffix_idx = 2
        while candidate in used:
            suffix = f"_{suffix_idx}"
            candidate = f"{base[: 64 - len(suffix)]}{suffix}"
            suffix_idx += 1
        used.add(candidate)
        bind.execute(sa.text("UPDATE users SET login_name = :login_name WHERE id = :id"), {"login_name": candidate, "id": user_id})

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.alter_column("login_name", existing_type=sa.String(length=64), nullable=False)
        batch_op.create_index("ix_users_login_name", ["login_name"], unique=True)

    if dialect != "sqlite":
        op.alter_column("users", "login_name", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_index("ix_users_login_name")
        batch_op.drop_column("login_name")
