from __future__ import annotations

import unittest
from typing import Generator
from unittest.mock import patch

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.testclient import TestClient

from app.api.routes import chapters as chapters_routes
from app.api.routes import memory as memory_routes
from app.api.routes import outlines as outlines_routes
from app.core.errors import AppError
from app.db.base import Base
from app.db.session import get_db
from app.main import app_error_handler, validation_error_handler
from app.models.chapter import Chapter
from app.models.outline import Outline
from app.models.project import Project
from app.models.project_settings import ProjectSettings
from app.models.story_memory import StoryMemory
from app.models.user import User


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
    app.include_router(outlines_routes.router, prefix="/api")
    app.include_router(chapters_routes.router, prefix="/api")
    app.include_router(memory_routes.router, prefix="/api")

    def _override_get_db() -> Generator[Session, None, None]:
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    return app


class TestForeshadowLifecycleCleanup(unittest.TestCase):
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
                ProjectSettings.__table__,
                Outline.__table__,
                Chapter.__table__,
                StoryMemory.__table__,
            ],
        )
        self.SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        self.app = _make_test_app(self.SessionLocal)

        with self.SessionLocal() as db:
            db.add(User(id="u_owner", display_name="owner"))
            project = Project(id="p1", owner_user_id="u_owner", name="Project 1", genre=None, logline=None)
            outline_1 = Outline(id="o1", project_id="p1", title="Outline 1", content_md="# O1")
            outline_2 = Outline(id="o2", project_id="p1", title="Outline 2", content_md="# O2")
            db.add(project)
            db.add_all([outline_1, outline_2])
            db.add(ProjectSettings(project_id="p1", vector_index_dirty=False))
            db.flush()
            project.active_outline_id = "o1"
            db.add_all(
                [
                    Chapter(id="c1", project_id="p1", outline_id="o1", number=1, title="C1", status="planned"),
                    Chapter(id="c2", project_id="p1", outline_id="o2", number=1, title="C2", status="planned"),
                ]
            )
            db.commit()

    def _seed_story_memory(self, memory_id: str, *, chapter_id: str | None, is_foreshadow: int = 1) -> None:
        with self.SessionLocal() as db:
            db.add(
                StoryMemory(
                    id=memory_id,
                    project_id="p1",
                    chapter_id=chapter_id,
                    memory_type="plot",
                    title=memory_id,
                    content=f"{memory_id} content",
                    importance_score=1.0,
                    story_timeline=1,
                    is_foreshadow=is_foreshadow,
                    foreshadow_resolved_at_chapter_id=None,
                )
            )
            db.commit()

    def _story_memory_ids(self) -> set[str]:
        with self.SessionLocal() as db:
            return set(db.execute(select(StoryMemory.id)).scalars().all())

    def test_open_loops_omit_orphan_foreshadows_without_chapter_source(self) -> None:
        self._seed_story_memory("chapter_foreshadow", chapter_id="c1")
        self._seed_story_memory("orphan_foreshadow", chapter_id=None)

        client = TestClient(self.app)
        resp = client.get("/api/projects/p1/story_memories/foreshadows/open_loops", headers={"X-Test-User": "u_owner"})

        self.assertEqual(resp.status_code, 200)
        items = resp.json()["data"]["items"]
        self.assertEqual([item["id"] for item in items], ["chapter_foreshadow"])

    def test_delete_outline_removes_story_memories_for_deleted_outline_chapters_only(self) -> None:
        self._seed_story_memory("deleted_outline_memory", chapter_id="c1")
        self._seed_story_memory("other_outline_memory", chapter_id="c2")
        self._seed_story_memory("project_level_memory", chapter_id=None)

        client = TestClient(self.app)
        with patch("app.api.routes.outlines.schedule_vector_rebuild_task", return_value=None), patch(
            "app.api.routes.outlines.schedule_search_rebuild_task", return_value=None
        ):
            resp = client.delete("/api/projects/p1/outlines/o1", headers={"X-Test-User": "u_owner"})

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self._story_memory_ids(), {"other_outline_memory", "project_level_memory"})

    def test_bulk_replace_removes_story_memories_for_replaced_chapters_only(self) -> None:
        self._seed_story_memory("replaced_chapter_memory", chapter_id="c1")
        self._seed_story_memory("other_outline_memory", chapter_id="c2")

        client = TestClient(self.app)
        with patch("app.api.routes.chapters.schedule_vector_rebuild_task", return_value=None), patch(
            "app.api.routes.chapters.schedule_search_rebuild_task", return_value=None
        ):
            resp = client.post(
                "/api/projects/p1/chapters/bulk_create?replace=true&outline_id=o1",
                headers={"X-Test-User": "u_owner"},
                json={"chapters": [{"number": 1, "title": "New C1", "plan": ""}]},
            )

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self._story_memory_ids(), {"other_outline_memory"})

    def test_delete_chapter_removes_story_memories_for_deleted_chapter(self) -> None:
        self._seed_story_memory("deleted_chapter_memory", chapter_id="c1")
        self._seed_story_memory("other_chapter_memory", chapter_id="c2")

        client = TestClient(self.app)
        with patch("app.api.routes.chapters.schedule_vector_rebuild_task", return_value=None), patch(
            "app.api.routes.chapters.schedule_search_rebuild_task", return_value=None
        ):
            resp = client.delete("/api/chapters/c1", headers={"X-Test-User": "u_owner"})

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self._story_memory_ids(), {"other_chapter_memory"})


if __name__ == "__main__":
    unittest.main()
