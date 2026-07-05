from __future__ import annotations

import unittest
from typing import Generator
from unittest.mock import patch

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.testclient import TestClient

from app.api.routes import story_memory as story_memory_routes
from app.core.errors import AppError
from app.db.base import Base
from app.db.session import get_db
from app.main import app_error_handler, validation_error_handler
from app.models.outline import Outline
from app.models.project import Project
from app.models.project_settings import ProjectSettings
from app.models.search_index import SearchDocument
from app.models.story_memory import StoryMemory
from app.models.user import User
from app.services.search_index_service import upsert_search_document


def _make_test_app(SessionLocal: sessionmaker) -> FastAPI:
    app = FastAPI()

    @app.middleware("http")
    async def _test_user_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
        request.state.request_id = "rid-test"
        user_id = request.headers.get("X-Test-User")
        request.state.user_id = user_id
        request.state.authenticated_user_id = user_id
        request.state.session_expire_at = None
        request.state.auth_source = "test"
        return await call_next(request)

    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.include_router(story_memory_routes.router, prefix="/api")

    def _override_get_db() -> Generator[Session, None, None]:
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    return app


class TestStoryMemoryIndexConsistency(unittest.TestCase):
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
                ProjectSettings.__table__,
                StoryMemory.__table__,
                SearchDocument.__table__,
            ],
        )
        with engine.begin() as conn:
            conn.exec_driver_sql(
                "CREATE VIRTUAL TABLE search_index USING fts5("
                "title,content,"
                "content='search_documents',content_rowid='id',"
                "tokenize='unicode61'"
                ")"
            )
            conn.exec_driver_sql(
                """
                CREATE TABLE vector_chunks (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    source TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    title TEXT,
                    text_md TEXT NOT NULL,
                    metadata_json TEXT NOT NULL
                )
                """
            )

        self.SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        self.app = _make_test_app(self.SessionLocal)

        with self.SessionLocal() as db:
            db.add(User(id="u_owner", display_name="owner"))
            db.add(Project(id="p1", owner_user_id="u_owner", name="Project 1", genre=None, logline=None))
            db.add(Outline(id="o1", project_id="p1", title="Outline 1", content_md=""))
            db.add(ProjectSettings(project_id="p1", vector_index_dirty=False))
            db.add(
                StoryMemory(
                    id="sm1",
                    project_id="p1",
                    chapter_id=None,
                    memory_type="plot_point",
                    title="污染记忆",
                    content="松本梨纱历史内容",
                    importance_score=1.0,
                    story_timeline=1,
                )
            )
            db.add(
                StoryMemory(
                    id="sm2",
                    project_id="p1",
                    chapter_id=None,
                    outline_id="o1",
                    scope="outline",
                    memory_type="plot_point",
                    title="可合并记忆",
                    content="合并源内容",
                    importance_score=0.5,
                    story_timeline=2,
                )
            )
            db.commit()
            upsert_search_document(
                db=db,
                project_id="p1",
                source_type="story_memory",
                source_id="sm1",
                title="污染记忆",
                content="松本梨纱历史内容",
                url_path="/projects/p1/chapter-analysis",
            )
            upsert_search_document(
                db=db,
                project_id="p1",
                source_type="story_memory",
                source_id="sm2",
                title="可合并记忆",
                content="合并源内容",
                url_path="/projects/p1/chapter-analysis",
            )
            db.execute(
                text(
                    """
                    INSERT INTO vector_chunks
                        (id, project_id, source, source_id, chunk_index, title, text_md, metadata_json)
                    VALUES
                        ('story_memory:sm1:0', 'p1', 'story_memory', 'sm1', 0, '污染记忆', '松本梨纱 chunk 0', '{}'),
                        ('story_memory:sm1:1', 'p1', 'story_memory', 'sm1', 1, '污染记忆', '松本梨纱 chunk 1', '{}'),
                        ('story_memory:sm2:0', 'p1', 'story_memory', 'sm2', 0, '可合并记忆', '合并源 chunk', '{}'),
                        ('story_memory:other:0', 'p1', 'story_memory', 'other', 0, '其他', '其他 chunk', '{}')
                    """
                )
            )
            db.commit()

    def test_create_and_list_story_memory_scope(self) -> None:
        client = TestClient(self.app)

        with patch("app.api.routes.story_memory.schedule_vector_rebuild_task", return_value=None), patch(
            "app.api.routes.story_memory.schedule_search_rebuild_task", return_value=None
        ):
            resp = client.post(
                "/api/projects/p1/story_memories",
                headers={"X-Test-User": "u_owner"},
                json={
                    "memory_type": "note",
                    "title": "项目级设定",
                    "content": "所有大纲共享",
                    "scope": "project",
                },
            )

        self.assertEqual(resp.status_code, 200)
        created = resp.json()["data"]["story_memory"]
        self.assertEqual(created["scope"], "project")
        self.assertIsNone(created["outline_id"])

        resp2 = client.get(
            "/api/projects/p1/story_memories?scope=project",
            headers={"X-Test-User": "u_owner"},
        )
        self.assertEqual(resp2.status_code, 200)
        items = resp2.json()["data"]["items"]
        self.assertEqual([it["id"] for it in items], [created["id"]])
        self.assertEqual(items[0]["scope"], "project")

    def test_list_injectable_outline_marks_status_without_hiding_unassigned(self) -> None:
        client = TestClient(self.app)

        resp = client.get(
            "/api/projects/p1/story_memories?injectable_for_outline_id=o1",
            headers={"X-Test-User": "u_owner"},
        )

        self.assertEqual(resp.status_code, 200)
        by_id = {it["id"]: it for it in resp.json()["data"]["items"]}
        self.assertIn("sm1", by_id)
        self.assertIn("sm2", by_id)
        self.assertEqual(by_id["sm1"]["scope"], "unassigned")
        self.assertEqual(by_id["sm1"]["injectable_for_current_outline"], False)
        self.assertEqual(by_id["sm2"]["scope"], "outline")
        self.assertEqual(by_id["sm2"]["injectable_for_current_outline"], True)

    def test_delete_story_memory_deletes_derived_indexes_without_rebuild(self) -> None:
        client = TestClient(self.app)

        with patch("app.api.routes.story_memory.schedule_vector_rebuild_task") as vector_rebuild, patch(
            "app.api.routes.story_memory.schedule_search_rebuild_task"
        ) as search_rebuild:
            resp = client.delete("/api/projects/p1/story_memories/sm1", headers={"X-Test-User": "u_owner"})

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["data"]["deleted_id"], "sm1")
        vector_rebuild.assert_not_called()
        search_rebuild.assert_not_called()

        with self.SessionLocal() as db:
            self.assertIsNone(db.get(StoryMemory, "sm1"))
            search_rows = db.execute(
                text(
                    """
                    SELECT COUNT(1)
                    FROM search_documents
                    WHERE project_id='p1' AND source_type='story_memory' AND source_id='sm1'
                    """
                )
            ).scalar_one()
            self.assertEqual(search_rows, 0)
            vector_rows = db.execute(
                text(
                    """
                    SELECT id
                    FROM vector_chunks
                    WHERE project_id='p1' AND source='story_memory'
                    ORDER BY id
                    """
                )
            ).scalars().all()
            self.assertEqual(vector_rows, ["story_memory:other:0", "story_memory:sm2:0"])

    def test_bulk_delete_story_memories_deletes_derived_indexes_without_rebuild(self) -> None:
        client = TestClient(self.app)

        with patch("app.api.routes.story_memory.schedule_vector_rebuild_task") as vector_rebuild, patch(
            "app.api.routes.story_memory.schedule_search_rebuild_task"
        ) as search_rebuild:
            resp = client.post(
                "/api/projects/p1/story_memories/bulk",
                headers={"X-Test-User": "u_owner"},
                json={"action": "delete", "ids": ["sm1", "sm2"]},
            )

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(set(resp.json()["data"]["deleted_ids"]), {"sm1", "sm2"})
        vector_rebuild.assert_not_called()
        search_rebuild.assert_not_called()

        with self.SessionLocal() as db:
            self.assertIsNone(db.get(StoryMemory, "sm1"))
            self.assertIsNone(db.get(StoryMemory, "sm2"))
            search_count = db.execute(
                text(
                    """
                    SELECT COUNT(1)
                    FROM search_documents
                    WHERE project_id='p1' AND source_type='story_memory' AND source_id IN ('sm1', 'sm2')
                    """
                )
            ).scalar_one()
            self.assertEqual(search_count, 0)
            vector_rows = db.execute(
                text(
                    """
                    SELECT id
                    FROM vector_chunks
                    WHERE project_id='p1' AND source='story_memory'
                    ORDER BY id
                    """
                )
            ).scalars().all()
            self.assertEqual(vector_rows, ["story_memory:other:0"])

    def test_merge_story_memories_deletes_source_derived_indexes_before_source(self) -> None:
        client = TestClient(self.app)

        with patch("app.api.routes.story_memory.schedule_vector_rebuild_task") as vector_rebuild, patch(
            "app.api.routes.story_memory.schedule_search_rebuild_task"
        ) as search_rebuild:
            resp = client.post(
                "/api/projects/p1/story_memories/merge",
                headers={"X-Test-User": "u_owner"},
                json={"target_id": "sm1", "source_ids": ["sm2"]},
            )

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["data"]["deleted_ids"], ["sm2"])
        vector_rebuild.assert_not_called()
        search_rebuild.assert_not_called()

        with self.SessionLocal() as db:
            self.assertIsNotNone(db.get(StoryMemory, "sm1"))
            self.assertIsNone(db.get(StoryMemory, "sm2"))
            source_search_count = db.execute(
                text(
                    """
                    SELECT COUNT(1)
                    FROM search_documents
                    WHERE project_id='p1' AND source_type='story_memory' AND source_id='sm2'
                    """
                )
            ).scalar_one()
            self.assertEqual(source_search_count, 0)
            source_vector_count = db.execute(
                text(
                    """
                    SELECT COUNT(1)
                    FROM vector_chunks
                    WHERE project_id='p1' AND source='story_memory' AND source_id='sm2'
                    """
                )
            ).scalar_one()
            self.assertEqual(source_vector_count, 0)


if __name__ == "__main__":
    unittest.main()
