from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, validates

from app.db.base import Base
from app.db.utils import utc_now


class ProjectOutlineGenerationPreference(Base):
    __tablename__ = "project_outline_generation_preferences"
    __table_args__ = (
        CheckConstraint("field IN ('tone','pacing')", name="ck_project_outline_generation_preferences_field"),
        UniqueConstraint("project_id", "user_id", "field", "value", name="uq_project_outline_generation_preferences_value"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    field: Mapped[str] = mapped_column(String(16), nullable=False)
    value: Mapped[str] = mapped_column(String(255), nullable=False)
    use_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    @validates("field")
    def _validate_field(self, _key: str, value: str) -> str:
        normalized = (value or "").strip().lower()
        if normalized not in ("tone", "pacing"):
            raise ValueError("invalid outline generation preference field")
        return normalized


Index(
    "ix_project_outline_generation_preferences_lookup",
    ProjectOutlineGenerationPreference.project_id,
    ProjectOutlineGenerationPreference.user_id,
    ProjectOutlineGenerationPreference.field,
    ProjectOutlineGenerationPreference.updated_at,
)
