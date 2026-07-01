"""merge notification and outline heads

Revision ID: 5d6c1e7a2b4f
Revises: 7ac9e2b6d4f1, 8f2d4a7b9c31
Create Date: 2026-07-01 12:40:00.000000

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "5d6c1e7a2b4f"
down_revision = ("7ac9e2b6d4f1", "8f2d4a7b9c31")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
