from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.utils import utc_now


class ProjectChapterGenerationInstructionPreference(Base):
    __tablename__ = "project_chapter_generation_instruction_preferences"
    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "user_id",
            "value",
            name="uq_project_chapter_generation_instruction_preferences_value",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    value: Mapped[str] = mapped_column(String(4000), nullable=False)
    use_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


Index(
    "ix_project_chapter_generation_instruction_preferences_lookup",
    ProjectChapterGenerationInstructionPreference.project_id,
    ProjectChapterGenerationInstructionPreference.user_id,
    ProjectChapterGenerationInstructionPreference.updated_at,
)
