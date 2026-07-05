from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import APIRouter, Query, Request
from pydantic import Field
from sqlalchemy import bindparam, or_, select, text

from app.api.deps import DbDep, UserIdDep, require_project_editor, require_project_viewer
from app.core.errors import AppError, ok_payload
from app.db.utils import new_id, utc_now
from app.models.chapter import Chapter
from app.models.outline import Outline
from app.models.project_settings import ProjectSettings
from app.models.story_memory import StoryMemory
from app.schemas.base import RequestModel
from app.services.search_index_service import schedule_search_rebuild_task
from app.services.story_memory_index_service import (
    delete_story_memory_derived_indexes,
    sync_story_memory_derived_metadata,
    upsert_story_memory_search_document,
)
from app.services.vector_rag_service import schedule_vector_rebuild_task

router = APIRouter()

StoryMemoryScope = Literal["outline", "project", "unassigned"]


def _parse_json_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except Exception:
        return []
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            out.append(item.strip())
    return out


def _parse_json_obj(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except Exception:
        return {}
    return value if isinstance(value, dict) else {}


def _compact_json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _mark_vector_index_dirty(db: DbDep, *, project_id: str) -> None:
    row = db.get(ProjectSettings, project_id)
    if row is None:
        row = ProjectSettings(project_id=project_id)
        db.add(row)
        db.flush()
    row.vector_index_dirty = True


def _tags_to_json(tags: list[str] | None) -> str:
    seen: set[str] = set()
    out: list[str] = []
    for raw in tags or []:
        t = str(raw or "").strip()
        if not t:
            continue
        k = t.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(t)
        if len(out) >= 80:
            break
    return _compact_json_dumps(out) if out else "[]"


def _is_done(m: StoryMemory) -> bool:
    meta = _parse_json_obj(getattr(m, "metadata_json", None))
    return bool(meta.get("done")) if isinstance(meta, dict) else False


def _to_out(m: StoryMemory) -> dict[str, Any]:
    return {
        "id": str(m.id),
        "project_id": str(m.project_id),
        "chapter_id": str(m.chapter_id) if m.chapter_id else None,
        "outline_id": str(m.outline_id) if getattr(m, "outline_id", None) else None,
        "scope": str(getattr(m, "scope", "") or "unassigned"),
        "memory_type": str(m.memory_type or ""),
        "title": str(m.title) if m.title is not None else None,
        "content": str(m.content or ""),
        "full_context_md": str(m.full_context_md) if m.full_context_md is not None else None,
        "importance_score": float(m.importance_score or 0.0),
        "tags": _parse_json_list(getattr(m, "tags_json", None)),
        "story_timeline": int(m.story_timeline or 0),
        "text_position": int(m.text_position or -1),
        "text_length": int(m.text_length or 0),
        "is_foreshadow": bool(getattr(m, "is_foreshadow", 0)),
        "resolved_at_chapter_id": str(m.foreshadow_resolved_at_chapter_id) if m.foreshadow_resolved_at_chapter_id else None,
        "done": _is_done(m),
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
    }


class StoryMemoryCreateRequest(RequestModel):
    chapter_id: str | None = Field(default=None, max_length=36)
    outline_id: str | None = Field(default=None, max_length=36)
    scope: StoryMemoryScope | None = None
    memory_type: str = Field(min_length=1, max_length=64)
    title: str | None = Field(default=None, max_length=255)
    content: str = Field(min_length=1, max_length=20000)
    full_context_md: str | None = Field(default=None, max_length=40000)
    importance_score: float = Field(default=0.0)
    tags: list[str] = Field(default_factory=list, max_length=80)
    story_timeline: int = Field(default=0)
    text_position: int = Field(default=-1)
    text_length: int = Field(default=0, ge=0)
    is_foreshadow: bool = Field(default=False)


class StoryMemoryUpdateRequest(RequestModel):
    chapter_id: str | None = Field(default=None, max_length=36)
    outline_id: str | None = Field(default=None, max_length=36)
    scope: StoryMemoryScope | None = None
    memory_type: str | None = Field(default=None, max_length=64)
    title: str | None = Field(default=None, max_length=255)
    content: str | None = Field(default=None, max_length=20000)
    full_context_md: str | None = Field(default=None, max_length=40000)
    importance_score: float | None = None
    tags: list[str] | None = Field(default=None, max_length=80)
    story_timeline: int | None = None
    text_position: int | None = None
    text_length: int | None = Field(default=None, ge=0)
    is_foreshadow: bool | None = None


class StoryMemoryMergeRequest(RequestModel):
    target_id: str = Field(max_length=36)
    source_ids: list[str] = Field(default_factory=list, min_length=1, max_length=20)


class StoryMemoryMarkDoneRequest(RequestModel):
    done: bool = True


class StoryMemoryBulkRequest(RequestModel):
    action: Literal["delete", "set_scope"]
    ids: list[str] = Field(default_factory=list, min_length=1, max_length=200)
    scope: StoryMemoryScope | None = None
    outline_id: str | None = Field(default=None, max_length=36)


def _validate_outline_id(db: DbDep, *, project_id: str, outline_id: str | None) -> str | None:
    oid = str(outline_id or "").strip() or None
    if oid is None:
        return None
    outline = db.get(Outline, oid)
    if outline is None or str(getattr(outline, "project_id", "")) != str(project_id):
        raise AppError.validation(details={"reason": "invalid_outline_id", "outline_id": oid})
    return oid


def _resolve_scope_and_outline(
    db: DbDep,
    *,
    project_id: str,
    scope: str | None,
    outline_id: str | None,
    chapter_id: str | None = None,
) -> tuple[str, str | None]:
    resolved_scope = str(scope or "unassigned").strip() or "unassigned"
    if resolved_scope not in {"outline", "project", "unassigned"}:
        raise AppError.validation(details={"reason": "invalid_story_memory_scope", "scope": resolved_scope})

    oid = _validate_outline_id(db, project_id=project_id, outline_id=outline_id)
    if resolved_scope == "outline":
        if oid is None and chapter_id:
            chapter = db.get(Chapter, chapter_id)
            if chapter is not None and str(getattr(chapter, "project_id", "")) == str(project_id):
                oid = str(getattr(chapter, "outline_id", "") or "").strip() or None
        if oid is None:
            raise AppError.validation(details={"reason": "outline_scope_requires_outline_id"})
        return resolved_scope, oid

    return resolved_scope, None


@router.get("/projects/{project_id}/story_memories")
def list_story_memories(
    request: Request,
    db: DbDep,
    user_id: UserIdDep,
    project_id: str,
    chapter_id: str | None = Query(default=None, max_length=36),
    scope: StoryMemoryScope | None = Query(default=None),
    outline_id: str | None = Query(default=None, max_length=36),
    q: str | None = Query(default=None, max_length=200),
    memory_type: str | None = Query(default=None, max_length=64),
    injectable_for_outline_id: str | None = Query(default=None, max_length=36),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> dict:
    request_id = request.state.request_id
    require_project_viewer(db, project_id=project_id, user_id=user_id)

    filters = [StoryMemory.project_id == project_id]
    if chapter_id is not None and str(chapter_id).strip():
        filters.append(StoryMemory.chapter_id == str(chapter_id))
    if scope is not None:
        filters.append(StoryMemory.scope == str(scope))
    if outline_id is not None and str(outline_id).strip():
        filters.append(StoryMemory.outline_id == str(outline_id).strip())
    if memory_type is not None and str(memory_type).strip():
        filters.append(StoryMemory.memory_type == str(memory_type).strip())
    if q is not None and str(q).strip():
        q_like = f"%{str(q).strip()}%"
        filters.append(or_(StoryMemory.title.like(q_like), StoryMemory.content.like(q_like), StoryMemory.full_context_md.like(q_like)))
    rows = (
        db.execute(select(StoryMemory).where(*filters).order_by(StoryMemory.updated_at.desc(), StoryMemory.id.desc()).limit(limit + 1).offset(offset))
        .scalars()
        .all()
    )
    has_more = len(rows) > limit
    rows = rows[:limit]
    items = [_to_out(m) for m in rows]
    injectable_oid = str(injectable_for_outline_id or outline_id or "").strip() or None
    if injectable_oid:
        for item in items:
            item["injectable_for_current_outline"] = item.get("scope") == "project" or (
                item.get("scope") == "outline" and item.get("outline_id") == injectable_oid
            )
    next_offset = (offset + limit) if has_more else None
    return ok_payload(request_id=request_id, data={"items": items, "next_offset": next_offset})


@router.post("/projects/{project_id}/story_memories")
def create_story_memory(
    request: Request,
    db: DbDep,
    user_id: UserIdDep,
    project_id: str,
    body: StoryMemoryCreateRequest,
) -> dict:
    request_id = request.state.request_id
    require_project_editor(db, project_id=project_id, user_id=user_id)

    chapter_id = str(body.chapter_id or "").strip() or None
    if chapter_id:
        chapter = db.get(Chapter, chapter_id)
        if chapter is None or str(getattr(chapter, "project_id", "")) != str(project_id):
            raise AppError.validation(details={"reason": "invalid_chapter_id", "chapter_id": chapter_id})
    default_scope = "outline" if chapter_id else "unassigned"
    scope, outline_id = _resolve_scope_and_outline(
        db,
        project_id=project_id,
        scope=body.scope or default_scope,
        outline_id=body.outline_id,
        chapter_id=chapter_id,
    )

    row = StoryMemory(
        id=new_id(),
        project_id=project_id,
        chapter_id=chapter_id,
        outline_id=outline_id,
        scope=scope,
        memory_type=str(body.memory_type).strip(),
        title=str(body.title).strip() if isinstance(body.title, str) and body.title.strip() else None,
        content=str(body.content or ""),
        full_context_md=str(body.full_context_md or "").strip() or None,
        importance_score=float(body.importance_score or 0.0),
        tags_json=_tags_to_json(list(body.tags or [])),
        story_timeline=int(body.story_timeline or 0),
        text_position=int(body.text_position or -1),
        text_length=int(body.text_length or 0),
        is_foreshadow=1 if bool(body.is_foreshadow) else 0,
    )
    db.add(row)
    _mark_vector_index_dirty(db, project_id=project_id)
    db.commit()
    db.refresh(row)

    schedule_vector_rebuild_task(db=db, project_id=project_id, actor_user_id=user_id, request_id=request_id, reason="story_memory_create")
    schedule_search_rebuild_task(db=db, project_id=project_id, actor_user_id=user_id, request_id=request_id, reason="story_memory_create")

    return ok_payload(request_id=request_id, data={"story_memory": _to_out(row)})


@router.put("/projects/{project_id}/story_memories/{story_memory_id}")
def update_story_memory(
    request: Request,
    db: DbDep,
    user_id: UserIdDep,
    project_id: str,
    story_memory_id: str,
    body: StoryMemoryUpdateRequest,
) -> dict:
    request_id = request.state.request_id
    require_project_editor(db, project_id=project_id, user_id=user_id)

    row = db.get(StoryMemory, story_memory_id)
    if row is None or str(getattr(row, "project_id", "")) != str(project_id):
        raise AppError.not_found()

    if body.chapter_id is not None:
        chapter_id = str(body.chapter_id or "").strip() or None
        if chapter_id:
            chapter = db.get(Chapter, chapter_id)
            if chapter is None or str(getattr(chapter, "project_id", "")) != str(project_id):
                raise AppError.validation(details={"reason": "invalid_chapter_id", "chapter_id": chapter_id})
        row.chapter_id = chapter_id

    old_content_key = (
        str(getattr(row, "content", "") or ""),
        str(getattr(row, "full_context_md", "") or ""),
    )
    if body.scope is not None or body.outline_id is not None:
        scope, outline_id = _resolve_scope_and_outline(
            db,
            project_id=project_id,
            scope=body.scope if body.scope is not None else str(getattr(row, "scope", "") or "unassigned"),
            outline_id=body.outline_id if body.outline_id is not None else getattr(row, "outline_id", None),
            chapter_id=getattr(row, "chapter_id", None),
        )
        row.scope = scope
        row.outline_id = outline_id

    if body.memory_type is not None and str(body.memory_type or "").strip():
        row.memory_type = str(body.memory_type).strip()
    if body.title is not None:
        row.title = str(body.title).strip() if isinstance(body.title, str) and body.title.strip() else None
    if body.content is not None:
        row.content = str(body.content or "")
    if body.full_context_md is not None:
        row.full_context_md = str(body.full_context_md or "").strip() or None
    if body.importance_score is not None:
        row.importance_score = float(body.importance_score or 0.0)
    if body.tags is not None:
        row.tags_json = _tags_to_json(list(body.tags or []))
    if body.story_timeline is not None:
        row.story_timeline = int(body.story_timeline or 0)
    if body.text_position is not None:
        row.text_position = int(body.text_position)
    if body.text_length is not None:
        row.text_length = int(body.text_length or 0)
    if body.is_foreshadow is not None:
        row.is_foreshadow = 1 if bool(body.is_foreshadow) else 0
        if not bool(body.is_foreshadow):
            row.foreshadow_resolved_at_chapter_id = None

    new_content_key = (
        str(getattr(row, "content", "") or ""),
        str(getattr(row, "full_context_md", "") or ""),
    )
    index_updates: dict[str, Any] = {}
    if new_content_key != old_content_key:
        index_updates["deleted_stale"] = delete_story_memory_derived_indexes(db=db, project_id=project_id, story_memory_ids=[story_memory_id])
        _mark_vector_index_dirty(db, project_id=project_id)
    db.flush()
    upsert_story_memory_search_document(db=db, memory=row)
    index_updates["metadata"] = sync_story_memory_derived_metadata(db=db, project_id=project_id, memories=[row])
    db.commit()
    db.refresh(row)

    return ok_payload(request_id=request_id, data={"story_memory": _to_out(row), "index_updates": index_updates})


@router.post("/projects/{project_id}/story_memories/bulk")
def bulk_story_memories(
    request: Request,
    db: DbDep,
    user_id: UserIdDep,
    project_id: str,
    body: StoryMemoryBulkRequest,
) -> dict:
    request_id = request.state.request_id
    require_project_editor(db, project_id=project_id, user_id=user_id)

    ids = [str(x or "").strip() for x in (body.ids or []) if str(x or "").strip()]
    ids = list(dict.fromkeys(ids))
    if not ids:
        raise AppError.validation(details={"reason": "ids_empty"})

    rows = (
        db.execute(select(StoryMemory).where(StoryMemory.project_id == project_id, StoryMemory.id.in_(ids)))
        .scalars()
        .all()
    )
    if len(rows) != len(ids):
        found = {str(r.id) for r in rows}
        missing = [sid for sid in ids if sid not in found]
        raise AppError.not_found("部分 story_memories 不存在", details={"missing_ids": missing})

    if body.action == "delete":
        index_deletes = delete_story_memory_derived_indexes(db=db, project_id=project_id, story_memory_ids=ids)
        for row in rows:
            db.delete(row)
        db.commit()
        return ok_payload(request_id=request_id, data={"deleted_ids": ids, "index_deletes": index_deletes})

    if body.action == "set_scope":
        if body.scope is None:
            raise AppError.validation(details={"reason": "scope_required"})
        updated_ids: list[str] = []
        for row in rows:
            scope, outline_id = _resolve_scope_and_outline(
                db,
                project_id=project_id,
                scope=body.scope,
                outline_id=body.outline_id,
                chapter_id=getattr(row, "chapter_id", None),
            )
            row.scope = scope
            row.outline_id = outline_id
            updated_ids.append(str(row.id))
        db.flush()
        index_updates = sync_story_memory_derived_metadata(db=db, project_id=project_id, memories=rows)
        db.commit()
        return ok_payload(request_id=request_id, data={"updated_ids": updated_ids, "index_updates": index_updates})

    raise AppError.validation(details={"reason": "unsupported_bulk_action"})


@router.delete("/projects/{project_id}/story_memories/{story_memory_id}")
def delete_story_memory(
    request: Request,
    db: DbDep,
    user_id: UserIdDep,
    project_id: str,
    story_memory_id: str,
) -> dict:
    request_id = request.state.request_id
    require_project_editor(db, project_id=project_id, user_id=user_id)

    row = db.get(StoryMemory, story_memory_id)
    if row is None or str(getattr(row, "project_id", "")) != str(project_id):
        raise AppError.not_found()

    index_deletes = delete_story_memory_derived_indexes(db=db, project_id=project_id, story_memory_ids=[story_memory_id])
    db.delete(row)
    db.commit()

    return ok_payload(request_id=request_id, data={"deleted_id": str(story_memory_id), "index_deletes": index_deletes})


@router.post("/projects/{project_id}/story_memories/merge")
def merge_story_memories(
    request: Request,
    db: DbDep,
    user_id: UserIdDep,
    project_id: str,
    body: StoryMemoryMergeRequest,
) -> dict:
    request_id = request.state.request_id
    require_project_editor(db, project_id=project_id, user_id=user_id)

    target_id = str(body.target_id or "").strip()
    if not target_id:
        raise AppError.validation(details={"reason": "target_id_empty"})

    source_ids = [str(x or "").strip() for x in (body.source_ids or []) if str(x or "").strip()]
    source_ids = [x for x in source_ids if x != target_id]
    if not source_ids:
        raise AppError.validation(details={"reason": "source_ids_empty"})

    target = db.get(StoryMemory, target_id)
    if target is None or str(getattr(target, "project_id", "")) != str(project_id):
        raise AppError.not_found()

    index_deletes = delete_story_memory_derived_indexes(db=db, project_id=project_id, story_memory_ids=source_ids)
    target_vector_deletes = delete_story_memory_derived_indexes(db=db, project_id=project_id, story_memory_ids=[target_id])

    sources = (
        db.execute(select(StoryMemory).where(StoryMemory.project_id == project_id, StoryMemory.id.in_(source_ids)))
        .scalars()
        .all()
    )
    if len(sources) != len(set(source_ids)):
        found = {str(s.id) for s in sources}
        missing = [sid for sid in source_ids if sid not in found]
        raise AppError.not_found("部分 story_memories 不存在", details={"missing_ids": missing})

    target_tags = _parse_json_list(getattr(target, "tags_json", None))
    merged_tags = list(target_tags)
    merged_content = str(target.content or "")
    merged_full_context = str(target.full_context_md or "").strip()
    merged_importance = float(target.importance_score or 0.0)
    merged_is_foreshadow = bool(getattr(target, "is_foreshadow", 0))

    deleted_ids: list[str] = []

    for src in sources:
        merged_content = (merged_content + "\n\n---\n\n" + str(src.content or "")).strip() if merged_content.strip() else str(src.content or "")
        if not merged_full_context.strip():
            merged_full_context = str(src.full_context_md or "").strip()
        merged_tags.extend(_parse_json_list(getattr(src, "tags_json", None)))
        merged_importance = max(merged_importance, float(src.importance_score or 0.0))
        merged_is_foreshadow = merged_is_foreshadow or bool(getattr(src, "is_foreshadow", 0))
        if bool(getattr(src, "is_foreshadow", 0)) and getattr(src, "foreshadow_resolved_at_chapter_id", None):
            target.foreshadow_resolved_at_chapter_id = src.foreshadow_resolved_at_chapter_id
        db.delete(src)
        deleted_ids.append(str(src.id))

    db.flush()
    target.content = merged_content
    target.full_context_md = merged_full_context.strip() or None
    target.tags_json = _tags_to_json(merged_tags)
    target.importance_score = merged_importance
    target.is_foreshadow = 1 if merged_is_foreshadow else 0

    _mark_vector_index_dirty(db, project_id=project_id)
    db.add(target)
    db.flush()
    upsert_story_memory_search_document(db=db, memory=target)
    final_source_vector_deletes = 0
    try:
        result = db.execute(
            text(
                """
                DELETE FROM vector_chunks
                WHERE project_id = :project_id
                  AND source = 'story_memory'
                  AND source_id IN :ids
                """
            ).bindparams(bindparam("ids", expanding=True)),
            {"project_id": project_id, "ids": source_ids},
        )
        final_source_vector_deletes = int(result.rowcount or 0)
    except Exception:
        raise
    db.commit()
    db.refresh(target)

    return ok_payload(
        request_id=request_id,
        data={
            "story_memory": _to_out(target),
            "deleted_ids": deleted_ids,
            "index_deletes": {
                "sources": index_deletes,
                "target_stale": target_vector_deletes,
                "sources_final": {"search_documents": 0, "vector_chunks": final_source_vector_deletes},
            },
            "index_updates": {"search_documents": 1, "vector_chunks": 0},
        },
    )


@router.post("/projects/{project_id}/story_memories/{story_memory_id}/mark_done")
def mark_story_memory_done(
    request: Request,
    db: DbDep,
    user_id: UserIdDep,
    project_id: str,
    story_memory_id: str,
    body: StoryMemoryMarkDoneRequest,
) -> dict:
    request_id = request.state.request_id
    require_project_editor(db, project_id=project_id, user_id=user_id)

    row = db.get(StoryMemory, story_memory_id)
    if row is None or str(getattr(row, "project_id", "")) != str(project_id):
        raise AppError.not_found()

    meta = _parse_json_obj(getattr(row, "metadata_json", None))
    done = bool(getattr(body, "done", True))
    if done:
        meta["done"] = True
        meta["done_at"] = utc_now().isoformat().replace("+00:00", "Z")
    else:
        meta.pop("done", None)
        meta.pop("done_at", None)
    row.metadata_json = _compact_json_dumps(meta) if meta else None

    _mark_vector_index_dirty(db, project_id=project_id)
    db.commit()
    db.refresh(row)

    schedule_vector_rebuild_task(db=db, project_id=project_id, actor_user_id=user_id, request_id=request_id, reason="story_memory_mark_done")
    schedule_search_rebuild_task(db=db, project_id=project_id, actor_user_id=user_id, request_id=request_id, reason="story_memory_mark_done")

    return ok_payload(request_id=request_id, data={"story_memory": _to_out(row)})
