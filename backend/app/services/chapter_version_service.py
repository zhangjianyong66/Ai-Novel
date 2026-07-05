from __future__ import annotations

import json
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.utils import new_id
from app.models.chapter import Chapter
from app.models.chapter_version import ChapterVersion
from app.models.project_settings import ProjectSettings

ChapterVersionSource = Literal["ai_generate", "ai_optimize", "manual_snapshot"]


def estimate_chapter_word_count(content_md: str) -> int:
    text = str(content_md or "").strip()
    if not text:
        return 0
    cjk = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
    non_cjk_words = [part for part in text.split() if part.strip()]
    return cjk + len(non_cjk_words)


def _mark_vector_index_dirty(db: Session, *, project_id: str) -> None:
    row = db.get(ProjectSettings, project_id)
    if row is None:
        row = ProjectSettings(project_id=project_id)
        db.add(row)
        db.flush()
    row.vector_index_dirty = True


def _meta_to_json(meta: dict[str, object] | None) -> str | None:
    if not meta:
        return None
    return json.dumps(meta, ensure_ascii=False, sort_keys=True)


def version_meta(version: ChapterVersion) -> dict[str, object] | None:
    raw = str(version.meta_json or "").strip()
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except Exception:
        return {"_raw": raw}
    return parsed if isinstance(parsed, dict) else {"_value": parsed}


def chapter_version_summary(version: ChapterVersion, *, active_version_id: str | None) -> dict[str, object]:
    return {
        "id": version.id,
        "chapter_id": version.chapter_id,
        "project_id": version.project_id,
        "source": version.source,
        "word_count": int(version.word_count or 0),
        "generation_run_id": version.generation_run_id,
        "provider": version.provider,
        "model": version.model,
        "meta": version_meta(version),
        "created_at": version.created_at,
        "is_active": str(version.id) == str(active_version_id or ""),
    }


def chapter_version_detail(version: ChapterVersion, *, active_version_id: str | None) -> dict[str, object]:
    out = chapter_version_summary(version, active_version_id=active_version_id)
    out["content_md"] = version.content_md
    return out


def get_active_chapter_version_summary(db: Session, chapter: Chapter) -> dict[str, object] | None:
    active_version_id = str(chapter.active_version_id or "").strip()
    if not active_version_id:
        return None
    version = db.get(ChapterVersion, active_version_id)
    if version is None or str(version.chapter_id) != str(chapter.id):
        return None
    return chapter_version_summary(version, active_version_id=active_version_id)


def create_chapter_version(
    *,
    db: Session,
    chapter: Chapter,
    content_md: str,
    source: ChapterVersionSource,
    generation_run_id: str | None = None,
    provider: str | None = None,
    model: str | None = None,
    meta: dict[str, object] | None = None,
) -> ChapterVersion:
    version = ChapterVersion(
        id=new_id(),
        project_id=str(chapter.project_id),
        chapter_id=str(chapter.id),
        source=source,
        content_md=str(content_md or ""),
        word_count=estimate_chapter_word_count(content_md),
        generation_run_id=(str(generation_run_id).strip() or None) if generation_run_id is not None else None,
        provider=(str(provider).strip() or None) if provider is not None else None,
        model=(str(model).strip() or None) if model is not None else None,
        meta_json=_meta_to_json(meta),
    )
    db.add(version)
    db.flush()
    return version


def ensure_current_content_snapshot(db: Session, *, chapter: Chapter) -> ChapterVersion | None:
    current_content = str(chapter.content_md or "")
    active_version_id = str(chapter.active_version_id or "").strip()
    if active_version_id:
        active = db.get(ChapterVersion, active_version_id)
        if active is not None and str(active.chapter_id) == str(chapter.id) and str(active.content_md or "") == current_content:
            return None

    return create_chapter_version(
        db=db,
        chapter=chapter,
        content_md=current_content,
        source="manual_snapshot",
        meta={"reason": "before_ai_version"},
    )


def create_and_activate_chapter_version(
    *,
    db: Session,
    chapter: Chapter,
    content_md: str,
    source: Literal["ai_generate", "ai_optimize"],
    generation_run_id: str | None = None,
    provider: str | None = None,
    model: str | None = None,
    meta: dict[str, object] | None = None,
) -> ChapterVersion:
    ensure_current_content_snapshot(db, chapter=chapter)
    version = create_chapter_version(
        db=db,
        chapter=chapter,
        content_md=content_md,
        source=source,
        generation_run_id=generation_run_id,
        provider=provider,
        model=model,
        meta=meta,
    )
    _activate_loaded_version(db=db, chapter=chapter, version=version)
    return version


def _activate_loaded_version(*, db: Session, chapter: Chapter, version: ChapterVersion) -> None:
    if str(chapter.status or "") == "done":
        raise AppError.validation(
            "章节已定稿，需先回退为起草中才能切换版本",
            details={"reason": "chapter_done_readonly", "allowed_action": "reopen_drafting"},
        )
    if str(version.chapter_id) != str(chapter.id):
        raise AppError.not_found("章节版本不存在")

    chapter.content_md = version.content_md
    chapter.active_version_id = version.id
    if str(chapter.status or "") == "planned" and str(chapter.content_md or "").strip():
        chapter.status = "drafting"
    _mark_vector_index_dirty(db, project_id=str(chapter.project_id))
    db.flush()


def activate_chapter_version(*, db: Session, chapter: Chapter, version_id: str) -> ChapterVersion:
    version = db.get(ChapterVersion, str(version_id))
    if version is None or str(version.chapter_id) != str(chapter.id):
        raise AppError.not_found("章节版本不存在")
    _activate_loaded_version(db=db, chapter=chapter, version=version)
    return version


def list_chapter_versions(*, db: Session, chapter: Chapter) -> list[ChapterVersion]:
    return list(
        db.execute(
            select(ChapterVersion)
            .where(ChapterVersion.chapter_id == str(chapter.id))
            .order_by(ChapterVersion.created_at.desc(), ChapterVersion.id.desc())
        ).scalars()
    )
