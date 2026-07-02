from __future__ import annotations

from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.utils import new_id, utc_now
from app.models.chapter_generation_instruction_preference import ProjectChapterGenerationInstructionPreference

CHAPTER_GENERATION_INSTRUCTION_PREFERENCE_LIMIT = 20


def list_chapter_generation_instruction_preferences(
    db: Session,
    *,
    project_id: str,
    user_id: str,
) -> dict[str, list[str]]:
    rows = (
        db.execute(
            select(ProjectChapterGenerationInstructionPreference)
            .where(
                ProjectChapterGenerationInstructionPreference.project_id == project_id,
                ProjectChapterGenerationInstructionPreference.user_id == user_id,
            )
            .order_by(
                ProjectChapterGenerationInstructionPreference.updated_at.desc(),
                ProjectChapterGenerationInstructionPreference.created_at.desc(),
            )
        )
        .scalars()
        .all()
    )
    instructions: list[str] = []
    for row in rows:
        if row.value not in instructions:
            instructions.append(row.value)
    return {"instructions": instructions}


def save_chapter_generation_instruction_preferences(
    db: Session,
    *,
    project_id: str,
    user_id: str,
    instruction: str | None = None,
    limit: int = CHAPTER_GENERATION_INSTRUCTION_PREFERENCE_LIMIT,
) -> dict[str, list[str]]:
    value = _normalize_value(instruction)
    if not value:
        return list_chapter_generation_instruction_preferences(db, project_id=project_id, user_id=user_id)

    now = _next_updated_at(db, project_id=project_id, user_id=user_id)
    row = (
        db.execute(
            select(ProjectChapterGenerationInstructionPreference).where(
                ProjectChapterGenerationInstructionPreference.project_id == project_id,
                ProjectChapterGenerationInstructionPreference.user_id == user_id,
                ProjectChapterGenerationInstructionPreference.value == value,
            )
        )
        .scalars()
        .first()
    )
    if row is None:
        db.add(
            ProjectChapterGenerationInstructionPreference(
                id=new_id(),
                project_id=project_id,
                user_id=user_id,
                value=value,
                use_count=1,
                created_at=now,
                updated_at=now,
            )
        )
    else:
        row.use_count += 1
        row.updated_at = now

    db.flush()
    _prune(db, project_id=project_id, user_id=user_id, limit=limit)
    db.commit()
    return list_chapter_generation_instruction_preferences(db, project_id=project_id, user_id=user_id)


def _normalize_value(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _prune(db: Session, *, project_id: str, user_id: str, limit: int) -> None:
    if limit <= 0:
        return
    rows = (
        db.execute(
            select(ProjectChapterGenerationInstructionPreference.id)
            .where(
                ProjectChapterGenerationInstructionPreference.project_id == project_id,
                ProjectChapterGenerationInstructionPreference.user_id == user_id,
            )
            .order_by(
                ProjectChapterGenerationInstructionPreference.updated_at.desc(),
                ProjectChapterGenerationInstructionPreference.created_at.desc(),
            )
        )
        .scalars()
        .all()
    )
    stale_ids = rows[limit:]
    if stale_ids:
        db.execute(delete(ProjectChapterGenerationInstructionPreference).where(ProjectChapterGenerationInstructionPreference.id.in_(stale_ids)))


def _next_updated_at(db: Session, *, project_id: str, user_id: str):
    now = utc_now()
    latest = (
        db.execute(
            select(ProjectChapterGenerationInstructionPreference.updated_at)
            .where(
                ProjectChapterGenerationInstructionPreference.project_id == project_id,
                ProjectChapterGenerationInstructionPreference.user_id == user_id,
            )
            .order_by(ProjectChapterGenerationInstructionPreference.updated_at.desc())
            .limit(1)
        )
        .scalars()
        .first()
    )
    if latest is None:
        return now
    if latest.tzinfo is not None and now.tzinfo is None:
        latest = latest.replace(tzinfo=None)
    if latest.tzinfo is None and now.tzinfo is not None:
        now = now.replace(tzinfo=None)
    return max(now, latest + timedelta(microseconds=1))
