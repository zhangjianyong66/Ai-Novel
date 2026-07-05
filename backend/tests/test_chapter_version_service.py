from __future__ import annotations

import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.chapter import Chapter
from app.models.chapter_version import ChapterVersion
from app.models.outline import Outline
from app.models.project import Project
from app.models.project_settings import ProjectSettings
from app.models.user import User
from app.services.chapter_version_service import (
    activate_chapter_version,
    create_and_activate_chapter_version,
)


class TestChapterVersionService(unittest.TestCase):
    def setUp(self) -> None:
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
                Outline.__table__,
                Chapter.__table__,
                ProjectSettings.__table__,
                ChapterVersion.__table__,
            ],
        )
        self.SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        with self.SessionLocal() as db:
            db.add(User(id="u1", display_name="User"))
            db.add(Project(id="p1", owner_user_id="u1", name="Project", genre=None, logline=None))
            db.add(Outline(id="o1", project_id="p1", title="Outline", content_md=None, structure_json=None))
            db.add(
                Chapter(
                    id="c1",
                    project_id="p1",
                    outline_id="o1",
                    number=1,
                    title="第一章",
                    plan="",
                    content_md="原正文",
                    summary=None,
                    status="drafting",
                )
            )
            db.commit()

    def _versions(self) -> list[ChapterVersion]:
        with self.SessionLocal() as db:
            return list(db.execute(select(ChapterVersion).order_by(ChapterVersion.created_at)).scalars())

    def test_create_ai_version_lazily_snapshots_current_content_and_activates(self) -> None:
        with self.SessionLocal() as db:
            chapter = db.get(Chapter, "c1")
            assert chapter is not None

            version = create_and_activate_chapter_version(
                db=db,
                chapter=chapter,
                content_md="AI 新正文",
                source="ai_generate",
                generation_run_id="run-1",
                provider="openai_compatible",
                model="model-a",
                meta={"task": "chapter_generate"},
            )
            db.commit()

            self.assertEqual(chapter.content_md, "AI 新正文")
            self.assertEqual(chapter.active_version_id, version.id)
            settings = db.get(ProjectSettings, "p1")
            self.assertIsNotNone(settings)
            self.assertTrue(settings.vector_index_dirty)

        versions = self._versions()
        self.assertEqual([v.source for v in versions], ["manual_snapshot", "ai_generate"])
        self.assertEqual(versions[0].content_md, "原正文")
        self.assertEqual(versions[1].content_md, "AI 新正文")
        self.assertEqual(versions[1].generation_run_id, "run-1")
        self.assertEqual(versions[1].provider, "openai_compatible")
        self.assertEqual(versions[1].model, "model-a")
        self.assertGreater(versions[1].word_count, 0)

    def test_create_ai_version_does_not_duplicate_snapshot_when_active_matches_current_content(self) -> None:
        with self.SessionLocal() as db:
            chapter = db.get(Chapter, "c1")
            assert chapter is not None
            create_and_activate_chapter_version(
                db=db,
                chapter=chapter,
                content_md="AI 第一版",
                source="ai_generate",
            )
            create_and_activate_chapter_version(
                db=db,
                chapter=chapter,
                content_md="AI 第二版",
                source="ai_optimize",
            )
            db.commit()

        versions = self._versions()
        self.assertEqual([v.source for v in versions], ["manual_snapshot", "ai_generate", "ai_optimize"])
        self.assertEqual(versions[-1].content_md, "AI 第二版")

    def test_activate_existing_version_updates_chapter_content(self) -> None:
        with self.SessionLocal() as db:
            chapter = db.get(Chapter, "c1")
            assert chapter is not None
            first = create_and_activate_chapter_version(db=db, chapter=chapter, content_md="AI 第一版", source="ai_generate")
            create_and_activate_chapter_version(db=db, chapter=chapter, content_md="AI 第二版", source="ai_generate")

            activated = activate_chapter_version(db=db, chapter=chapter, version_id=first.id)
            db.commit()

            self.assertEqual(activated.id, first.id)
            self.assertEqual(chapter.active_version_id, first.id)
            self.assertEqual(chapter.content_md, "AI 第一版")

    def test_done_chapter_cannot_activate_version(self) -> None:
        with self.SessionLocal() as db:
            chapter = db.get(Chapter, "c1")
            assert chapter is not None
            version = create_and_activate_chapter_version(db=db, chapter=chapter, content_md="AI 第一版", source="ai_generate")
            chapter.status = "done"
            db.flush()

            with self.assertRaisesRegex(Exception, "章节已定稿"):
                activate_chapter_version(db=db, chapter=chapter, version_id=version.id)


if __name__ == "__main__":
    unittest.main()
