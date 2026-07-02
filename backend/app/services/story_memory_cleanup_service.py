from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models.story_memory import StoryMemory


def delete_story_memories_for_chapter_ids(db: Session, chapter_ids: Iterable[str]) -> None:
    ids = [str(chapter_id) for chapter_id in chapter_ids if str(chapter_id or "").strip()]
    if not ids:
        return
    db.execute(delete(StoryMemory).where(StoryMemory.chapter_id.in_(ids)))
