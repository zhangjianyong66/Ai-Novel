from __future__ import annotations

from collections.abc import Sequence
import json
from typing import Any

from sqlalchemy import bindparam, select, text
from sqlalchemy.orm import Session

from app.models.search_index import SearchDocument
from app.models.story_memory import StoryMemory
from app.services.search_index_service import delete_search_document, upsert_search_document


def _table_exists(db: Session, table_name: str) -> bool:
    bind = db.get_bind()
    if bind is None:
        return False
    dialect = str(getattr(getattr(bind, "dialect", None), "name", "") or "")
    try:
        if dialect == "sqlite":
            row = db.execute(
                text("SELECT name FROM sqlite_master WHERE type='table' AND name=:name LIMIT 1"),
                {"name": table_name},
            ).first()
            return row is not None
        if dialect == "postgresql":
            row = db.execute(text("SELECT to_regclass(:name)"), {"name": table_name}).scalar_one_or_none()
            return row is not None
    except Exception:
        return False
    return False


def delete_story_memory_derived_indexes(
    *,
    db: Session,
    project_id: str,
    story_memory_ids: Sequence[str],
) -> dict[str, Any]:
    ids = [str(x or "").strip() for x in story_memory_ids if str(x or "").strip()]
    if not ids:
        return {"search_documents": 0, "vector_chunks": 0}

    search_deleted = 0
    for memory_id in ids:
        if delete_search_document(db=db, project_id=project_id, source_type="story_memory", source_id=memory_id):
            search_deleted += 1

    vector_deleted = 0
    if _table_exists(db, "vector_chunks"):
        stmt = text(
            """
            DELETE FROM vector_chunks
            WHERE project_id = :project_id
              AND source = 'story_memory'
              AND source_id IN :ids
            """
        ).bindparams(bindparam("ids", expanding=True))
        result = db.execute(stmt, {"project_id": project_id, "ids": ids})
        vector_deleted = int(result.rowcount or 0)

    return {"search_documents": int(search_deleted), "vector_chunks": int(vector_deleted)}


def _trim(value: Any) -> str:
    return str(value or "").strip()


def story_memory_search_locator(memory: StoryMemory) -> str:
    return json.dumps(
        {
            "story_memory_id": str(memory.id),
            "chapter_id": _trim(getattr(memory, "chapter_id", None)) or None,
            "scope": _trim(getattr(memory, "scope", None)) or "unassigned",
            "outline_id": _trim(getattr(memory, "outline_id", None)) or None,
        },
        ensure_ascii=False,
    )


def upsert_story_memory_search_document(*, db: Session, memory: StoryMemory) -> SearchDocument | None:
    content = _trim(getattr(memory, "content", None))
    full_context = _trim(getattr(memory, "full_context_md", None))
    if not (content or full_context):
        return None
    memory_type = _trim(getattr(memory, "memory_type", None)) or "story_memory"
    title = _trim(getattr(memory, "title", None)) or memory_type
    chapter_id = _trim(getattr(memory, "chapter_id", None))
    return upsert_search_document(
        db=db,
        project_id=str(memory.project_id),
        source_type="story_memory",
        source_id=str(memory.id),
        title=title,
        content="\n\n".join([x for x in [title, content, full_context] if x]).strip(),
        url_path=f"/projects/{memory.project_id}/chapter-analysis?chapterId={chapter_id}"
        if chapter_id
        else f"/projects/{memory.project_id}/chapter-analysis",
        locator_json=story_memory_search_locator(memory),
    )


def sync_story_memory_derived_metadata(*, db: Session, project_id: str, memories: Sequence[StoryMemory]) -> dict[str, int]:
    rows = [m for m in memories if str(getattr(m, "project_id", "")) == str(project_id)]
    if not rows:
        return {"search_documents": 0, "vector_chunks": 0}

    search_updated = 0
    for memory in rows:
        search_doc = (
            db.execute(
                select(SearchDocument).where(
                    SearchDocument.project_id == str(project_id),
                    SearchDocument.source_type == "story_memory",
                    SearchDocument.source_id == str(memory.id),
                )
            )
            .scalars()
            .first()
        )
        if search_doc is None:
            continue
        search_doc.locator_json = story_memory_search_locator(memory)
        search_updated += 1

    vector_updated = 0
    if _table_exists(db, "vector_chunks"):
        for memory in rows:
            chunk_rows = db.execute(
                text(
                    """
                    SELECT id, metadata_json
                    FROM vector_chunks
                    WHERE project_id = :project_id
                      AND source = 'story_memory'
                      AND source_id = :source_id
                    """
                ),
                {"project_id": project_id, "source_id": str(memory.id)},
            ).all()
            for chunk_id, metadata_json in chunk_rows:
                try:
                    meta = json.loads(str(metadata_json or "{}"))
                except Exception:
                    meta = {}
                if not isinstance(meta, dict):
                    meta = {}
                meta["scope"] = _trim(getattr(memory, "scope", None)) or "unassigned"
                meta["outline_id"] = _trim(getattr(memory, "outline_id", None)) or None
                meta["chapter_id"] = _trim(getattr(memory, "chapter_id", None)) or None
                db.execute(
                    text("UPDATE vector_chunks SET metadata_json = :metadata_json WHERE id = :id"),
                    {"id": str(chunk_id), "metadata_json": json.dumps(meta, ensure_ascii=False)},
                )
                vector_updated += 1

    return {"search_documents": int(search_updated), "vector_chunks": int(vector_updated)}
