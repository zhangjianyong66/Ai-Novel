from __future__ import annotations

import json
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.outline import Outline
from app.models.project import Project
from app.models.project_settings import ProjectSettings
from app.models.story_memory import StoryMemory
from app.models.user import User
from app.services.memory_retrieval_service import retrieve_memory_context_pack


class TestMemoryRetrievalScope(unittest.TestCase):
    def test_story_memory_pack_filters_by_outline_scope(self) -> None:
        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.addCleanup(engine.dispose)
        Base.metadata.create_all(
            engine,
            tables=[
                User.__table__,
                Project.__table__,
                ProjectSettings.__table__,
                Outline.__table__,
                StoryMemory.__table__,
            ],
        )
        SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

        with SessionLocal() as db:
            db.add(User(id="u1", display_name="u1"))
            db.add(Project(id="p1", owner_user_id="u1", name="p1", genre=None, logline=None))
            db.add(ProjectSettings(project_id="p1"))
            db.add(Outline(id="o1", project_id="p1", title="当前大纲", content_md=""))
            db.add(Outline(id="o2", project_id="p1", title="历史大纲", content_md=""))
            db.add_all(
                [
                    StoryMemory(
                        id="current",
                        project_id="p1",
                        outline_id="o1",
                        scope="outline",
                        memory_type="plot_point",
                        title="当前",
                        content="当前大纲记忆",
                        importance_score=1.0,
                    ),
                    StoryMemory(
                        id="global",
                        project_id="p1",
                        outline_id=None,
                        scope="project",
                        memory_type="plot_point",
                        title="全局",
                        content="项目全局记忆",
                        importance_score=1.0,
                    ),
                    StoryMemory(
                        id="other",
                        project_id="p1",
                        outline_id="o2",
                        scope="outline",
                        memory_type="plot_point",
                        title="其他",
                        content="松本梨纱历史大纲污染",
                        importance_score=100.0,
                    ),
                    StoryMemory(
                        id="unassigned",
                        project_id="p1",
                        outline_id=None,
                        scope="unassigned",
                        memory_type="plot_point",
                        title="未归属",
                        content="未归属污染",
                        importance_score=100.0,
                    ),
                ]
            )
            db.commit()

            pack = retrieve_memory_context_pack(
                db=db,
                project_id="p1",
                outline_id="o1",
                query_text="记忆 污染",
                section_enabled={
                    "story_memory": True,
                    "worldbook": False,
                    "semantic_history": False,
                    "foreshadow_open_loops": False,
                    "structured": False,
                    "tables": False,
                    "vector_rag": False,
                    "graph": False,
                    "fractal": False,
                },
            )

        text_md = pack.story_memory.text_md
        self.assertIn("当前大纲记忆", text_md)
        self.assertIn("项目全局记忆", text_md)
        self.assertNotIn("松本梨纱", text_md)
        self.assertNotIn("未归属污染", text_md)

    def test_next_requirements_pack_filters_target_chapter_and_excludes_story_memory(self) -> None:
        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.addCleanup(engine.dispose)
        Base.metadata.create_all(
            engine,
            tables=[
                User.__table__,
                Project.__table__,
                ProjectSettings.__table__,
                Outline.__table__,
                StoryMemory.__table__,
            ],
        )
        SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

        with SessionLocal() as db:
            db.add(User(id="u1", display_name="u1"))
            db.add(Project(id="p1", owner_user_id="u1", name="p1", genre=None, logline=None))
            db.add(ProjectSettings(project_id="p1"))
            db.add(Outline(id="o1", project_id="p1", title="当前大纲", content_md=""))
            db.add_all(
                [
                    StoryMemory(
                        id="regular",
                        project_id="p1",
                        outline_id="o1",
                        scope="outline",
                        memory_type="continuity_fact",
                        title="连续性事实",
                        content="钥匙已经交给林澈。",
                        importance_score=1.0,
                    ),
                    StoryMemory(
                        id="next-12",
                        project_id="p1",
                        outline_id="o1",
                        scope="outline",
                        memory_type="next_requirement",
                        title="下一章承接",
                        content="必须让林澈使用钥匙。",
                        importance_score=1.0,
                        metadata_json=json.dumps(
                            {
                                "target_chapter_number": 12,
                                "lifecycle": "next_chapter_only",
                                "asset_type": "next_chapter_requirement",
                            },
                            ensure_ascii=False,
                        ),
                    ),
                    StoryMemory(
                        id="next-13",
                        project_id="p1",
                        outline_id="o1",
                        scope="outline",
                        memory_type="next_requirement",
                        title="远期要求",
                        content="第十三章再揭示钟声。",
                        importance_score=1.0,
                        metadata_json=json.dumps({"target_chapter_number": 13}, ensure_ascii=False),
                    ),
                ]
            )
            db.commit()

            pack = retrieve_memory_context_pack(
                db=db,
                project_id="p1",
                outline_id="o1",
                chapter_number=12,
                query_text="钥匙",
                section_enabled={
                    "story_memory": True,
                    "next_requirements": True,
                    "worldbook": False,
                    "semantic_history": False,
                    "foreshadow_open_loops": False,
                    "structured": False,
                    "tables": False,
                    "vector_rag": False,
                    "graph": False,
                    "fractal": False,
                },
            )

        self.assertIn("钥匙已经交给林澈", pack.story_memory.text_md)
        self.assertNotIn("必须让林澈使用钥匙", pack.story_memory.text_md)
        self.assertIn("必须让林澈使用钥匙", pack.next_requirements.text_md)
        self.assertNotIn("第十三章再揭示钟声", pack.next_requirements.text_md)


if __name__ == "__main__":
    unittest.main()
