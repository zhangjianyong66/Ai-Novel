from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.utils import new_id, utc_now
from app.models.outline_generation_preference import ProjectOutlineGenerationPreference

OUTLINE_GENERATION_PREFERENCE_LIMIT = 20
OUTLINE_GENERATION_PREFERENCE_FIELDS = ("tone", "pacing")


def list_outline_generation_preferences(
    db: Session,
    *,
    project_id: str,
    user_id: str,
) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {"tone": [], "pacing": []}
    rows = (
        db.execute(
            select(ProjectOutlineGenerationPreference)
            .where(
                ProjectOutlineGenerationPreference.project_id == project_id,
                ProjectOutlineGenerationPreference.user_id == user_id,
            )
            .order_by(
                ProjectOutlineGenerationPreference.field.asc(),
                ProjectOutlineGenerationPreference.updated_at.desc(),
                ProjectOutlineGenerationPreference.created_at.desc(),
            )
        )
        .scalars()
        .all()
    )
    for row in rows:
        if row.field in result and row.value not in result[row.field]:
            result[row.field].append(row.value)
    return result


def save_outline_generation_preferences(
    db: Session,
    *,
    project_id: str,
    user_id: str,
    tone: str | None = None,
    pacing: str | None = None,
    limit: int = OUTLINE_GENERATION_PREFERENCE_LIMIT,
) -> dict[str, list[str]]:
    values = {"tone": _normalize_value(tone), "pacing": _normalize_value(pacing)}
    now = _next_updated_at(db, project_id=project_id, user_id=user_id)
    for field, value in values.items():
        if not value:
            continue
        row = (
            db.execute(
                select(ProjectOutlineGenerationPreference).where(
                    ProjectOutlineGenerationPreference.project_id == project_id,
                    ProjectOutlineGenerationPreference.user_id == user_id,
                    ProjectOutlineGenerationPreference.field == field,
                    ProjectOutlineGenerationPreference.value == value,
                )
            )
            .scalars()
            .first()
        )
        if row is None:
            db.add(
                ProjectOutlineGenerationPreference(
                    id=new_id(),
                    project_id=project_id,
                    user_id=user_id,
                    field=field,
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
        _prune_field(db, project_id=project_id, user_id=user_id, field=field, limit=limit)

    db.commit()
    return list_outline_generation_preferences(db, project_id=project_id, user_id=user_id)


def _normalize_value(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _prune_field(db: Session, *, project_id: str, user_id: str, field: str, limit: int) -> None:
    if limit <= 0:
        return
    rows = (
        db.execute(
            select(ProjectOutlineGenerationPreference.id)
            .where(
                ProjectOutlineGenerationPreference.project_id == project_id,
                ProjectOutlineGenerationPreference.user_id == user_id,
                ProjectOutlineGenerationPreference.field == field,
            )
            .order_by(
                ProjectOutlineGenerationPreference.updated_at.desc(),
                ProjectOutlineGenerationPreference.created_at.desc(),
            )
        )
        .scalars()
        .all()
    )
    stale_ids = rows[limit:]
    if stale_ids:
        db.execute(delete(ProjectOutlineGenerationPreference).where(ProjectOutlineGenerationPreference.id.in_(stale_ids)))


def _next_updated_at(db: Session, *, project_id: str, user_id: str):
    now = utc_now()
    latest = (
        db.execute(
            select(ProjectOutlineGenerationPreference.updated_at)
            .where(
                ProjectOutlineGenerationPreference.project_id == project_id,
                ProjectOutlineGenerationPreference.user_id == user_id,
            )
            .order_by(ProjectOutlineGenerationPreference.updated_at.desc())
            .limit(1)
        )
        .scalars()
        .first()
    )
    if latest is not None and _as_naive_utc(latest) >= _as_naive_utc(now):
        return latest + timedelta(seconds=1)
    return now


def _as_naive_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=None)
