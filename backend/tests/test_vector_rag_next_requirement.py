from __future__ import annotations

import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.project import Project
from app.models.story_memory import StoryMemory
from app.models.user import User
from app.services.vector_rag_service import build_project_chunks


class TestVectorRagNextRequirement(unittest.TestCase):
    def test_build_project_chunks_excludes_next_requirement_story_memory(self) -> None:
        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.addCleanup(engine.dispose)
        Base.metadata.create_all(engine, tables=[User.__table__, Project.__table__, StoryMemory.__table__])
        SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

        with SessionLocal() as db:
            db.add(User(id="u1", display_name="u1"))
            db.add(Project(id="p1", owner_user_id="u1", name="p1", genre=None, logline=None))
            db.add_all(
                [
                    StoryMemory(
                        id="regular",
                        project_id="p1",
                        memory_type="continuity_fact",
                        title="事实",
                        content="钥匙已经交给林澈。",
                        importance_score=1.0,
                    ),
                    StoryMemory(
                        id="next",
                        project_id="p1",
                        memory_type="next_requirement",
                        title="下一章要求",
                        content="必须让林澈使用钥匙。",
                        importance_score=1.0,
                    ),
                ]
            )
            db.commit()

            chunks = build_project_chunks(db=db, project_id="p1", sources=["story_memory"])

        ids = [chunk.id for chunk in chunks]
        self.assertTrue(any(chunk_id.startswith("story_memory:regular:") for chunk_id in ids))
        self.assertFalse(any(chunk_id.startswith("story_memory:next:") for chunk_id in ids))


if __name__ == "__main__":
    unittest.main()
