from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from sqlalchemy import select
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.testclient import TestClient

from app.api.routes import chapters as chapters_routes
from app.core.errors import AppError
from app.db.base import Base
from app.main import app_error_handler, validation_error_handler
from app.models.chapter import Chapter
from app.models.outline import Outline
from app.models.project import Project
from app.models.project_settings import ProjectSettings
from app.models.project_task import ProjectTask
from app.models.project_task_event import ProjectTaskEvent
from app.models.user import User


class _DummyQueue:
    def enqueue(self, *, kind: str, task_id: str) -> None:
        return None


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
    app.include_router(chapters_routes.router, prefix="/api")

    return app


class TestChapterTriggerAutoUpdatesEndpoint(unittest.TestCase):
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
                ProjectTask.__table__,
                ProjectTaskEvent.__table__,
            ],
        )

        self.SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        self.app = _make_test_app(self.SessionLocal)

        with self.SessionLocal() as db:
            db.add(User(id="u_owner", display_name="owner"))
            db.add(Project(id="p1", owner_user_id="u_owner", name="Project 1", genre=None, logline=None))
            db.add(
                ProjectSettings(
                    project_id="p1",
                    vector_index_dirty=True,
                    auto_update_tables_enabled=False,
                )
            )
            db.add(Outline(id="o1", project_id="p1", title="Outline 1", content_md=None, structure_json=None))
            db.add(
                Chapter(
                    id="c1",
                    project_id="p1",
                    outline_id="o1",
                    number=1,
                    title="Chapter 1",
                    plan="hello",
                    content_md="content",
                    summary="summary",
                    status="drafting",
                )
            )
            db.commit()

    def test_trigger_chapter_auto_updates_is_idempotent_by_generation_run_id(self) -> None:
        with self.SessionLocal() as db:
            chapter = db.get(Chapter, "c1")
            self.assertIsNotNone(chapter)
            chapter.status = "done"
            db.commit()

        client = TestClient(self.app)
        with patch("app.db.session.SessionLocal", self.SessionLocal), patch(
            "app.services.task_queue.get_task_queue", return_value=_DummyQueue()
        ), patch("app.services.plot_analysis_service.get_task_queue", return_value=_DummyQueue()), patch(
            "app.services.characters_auto_update_service.get_task_queue", return_value=_DummyQueue()
        ):
            resp1 = client.post(
                "/api/chapters/c1/trigger_auto_updates",
                headers={"X-Test-User": "u_owner"},
                json={"generation_run_id": "run-1"},
            )
            self.assertEqual(resp1.status_code, 200)
            payload1 = resp1.json()
            self.assertTrue(payload1.get("ok"))
            data1 = payload1.get("data") or {}
            tasks1 = data1.get("tasks") or {}
            self.assertTrue(str(tasks1.get("vector_rebuild") or ""))
            self.assertTrue(str(tasks1.get("search_rebuild") or ""))
            self.assertTrue(str(tasks1.get("worldbook_auto_update") or ""))
            self.assertTrue(str(tasks1.get("graph_auto_update") or ""))

            with self.SessionLocal() as db:
                before = db.execute(select(ProjectTask)).scalars().all()

            resp2 = client.post(
                "/api/chapters/c1/trigger_auto_updates",
                headers={"X-Test-User": "u_owner"},
                json={"generation_run_id": "run-1"},
            )
            self.assertEqual(resp2.status_code, 200)
            payload2 = resp2.json()
            self.assertTrue(payload2.get("ok"))
            data2 = payload2.get("data") or {}
            tasks2 = data2.get("tasks") or {}

            self.assertEqual(tasks2, tasks1)

            with self.SessionLocal() as db:
                after = db.execute(select(ProjectTask)).scalars().all()

            self.assertEqual(len(after), len(before))

    def test_trigger_chapter_auto_updates_for_draft_only_creates_index_tasks(self) -> None:
        client = TestClient(self.app)
        with patch("app.db.session.SessionLocal", self.SessionLocal), patch(
            "app.services.task_queue.get_task_queue", return_value=_DummyQueue()
        ):
            resp = client.post(
                "/api/chapters/c1/trigger_auto_updates",
                headers={"X-Test-User": "u_owner"},
                json={},
            )

        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertTrue(payload.get("ok"))
        data = payload.get("data") or {}
        tasks = data.get("tasks") or {}
        self.assertTrue(str(tasks.get("vector_rebuild") or ""))
        self.assertTrue(str(tasks.get("search_rebuild") or ""))
        self.assertIsNone(tasks.get("worldbook_auto_update"))
        self.assertIsNone(tasks.get("characters_auto_update"))
        self.assertIsNone(tasks.get("plot_auto_update"))
        self.assertIsNone(tasks.get("table_ai_update"))
        self.assertIsNone(tasks.get("graph_auto_update"))
        self.assertIsNone(tasks.get("fractal_rebuild"))
        self.assertEqual(
            set(tasks.keys()),
            {
                "vector_rebuild",
                "search_rebuild",
                "worldbook_auto_update",
                "characters_auto_update",
                "plot_auto_update",
                "table_ai_update",
                "graph_auto_update",
                "fractal_rebuild",
            },
        )

        with self.SessionLocal() as db:
            rows = db.execute(select(ProjectTask)).scalars().all()
        self.assertEqual({row.kind for row in rows}, {"vector_rebuild", "search_rebuild"})

    def test_update_chapter_rejects_status_field(self) -> None:
        client = TestClient(self.app)
        with patch("app.db.session.SessionLocal", self.SessionLocal), patch(
            "app.services.task_queue.get_task_queue", return_value=_DummyQueue()
        ):
            resp = client.put(
                "/api/chapters/c1",
                headers={"X-Test-User": "u_owner"},
                json={"status": "done", "content_md": "final content", "summary": "final summary"},
            )

        self.assertEqual(resp.status_code, 400)
        payload = resp.json()
        self.assertFalse(payload.get("ok"))
        error = payload.get("error") or {}
        self.assertEqual(error.get("code"), "VALIDATION_ERROR")
        self.assertEqual(
            (error.get("details") or {}).get("reason"),
            "chapter_status_update_requires_status_endpoint",
        )

        with self.SessionLocal() as db:
            chapter = db.get(Chapter, "c1")
            self.assertIsNotNone(chapter)
            self.assertEqual(chapter.status, "drafting")
            self.assertEqual(chapter.content_md, "content")
            rows = db.execute(select(ProjectTask)).scalars().all()
        self.assertEqual(rows, [])

    def test_update_chapter_status_to_done_does_not_create_project_tasks(self) -> None:
        client = TestClient(self.app)
        with patch("app.db.session.SessionLocal", self.SessionLocal), patch(
            "app.services.task_queue.get_task_queue", return_value=_DummyQueue()
        ):
            resp = client.patch(
                "/api/chapters/c1/status",
                headers={"X-Test-User": "u_owner"},
                json={"status": "done", "expected_status": "drafting"},
            )

        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertTrue(payload.get("ok"))
        chapter = (payload.get("data") or {}).get("chapter") or {}
        self.assertEqual(chapter.get("status"), "done")
        self.assertEqual(chapter.get("content_md"), "content")

        with self.SessionLocal() as db:
            chapter_row = db.get(Chapter, "c1")
            self.assertIsNotNone(chapter_row)
            self.assertEqual(chapter_row.status, "done")
            settings = db.get(ProjectSettings, "p1")
            self.assertIsNotNone(settings)
            self.assertTrue(settings.vector_index_dirty)
            rows = db.execute(select(ProjectTask)).scalars().all()
        self.assertEqual(rows, [])

    def test_update_chapter_content_does_not_create_project_tasks(self) -> None:
        client = TestClient(self.app)
        with patch("app.db.session.SessionLocal", self.SessionLocal), patch(
            "app.services.task_queue.get_task_queue", return_value=_DummyQueue()
        ):
            resp = client.put(
                "/api/chapters/c1",
                headers={"X-Test-User": "u_owner"},
                json={"content_md": "draft content update"},
            )

        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertTrue(payload.get("ok"))
        chapter = (payload.get("data") or {}).get("chapter") or {}
        self.assertEqual(chapter.get("content_md"), "draft content update")

        with self.SessionLocal() as db:
            rows = db.execute(select(ProjectTask)).scalars().all()
        self.assertEqual(rows, [])

    def test_update_planned_chapter_with_empty_content_keeps_planned_status(self) -> None:
        with self.SessionLocal() as db:
            chapter = db.get(Chapter, "c1")
            self.assertIsNotNone(chapter)
            chapter.status = "planned"
            chapter.content_md = ""
            db.commit()

        client = TestClient(self.app)
        with patch("app.db.session.SessionLocal", self.SessionLocal), patch(
            "app.services.task_queue.get_task_queue", return_value=_DummyQueue()
        ):
            resp = client.put(
                "/api/chapters/c1",
                headers={"X-Test-User": "u_owner"},
                json={"title": "Chapter 1 revised", "plan": "outline only", "summary": "notes", "content_md": "   \n"},
            )

        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertTrue(payload.get("ok"))
        chapter = (payload.get("data") or {}).get("chapter") or {}
        self.assertEqual(chapter.get("status"), "planned")

        with self.SessionLocal() as db:
            chapter_row = db.get(Chapter, "c1")
            self.assertIsNotNone(chapter_row)
            self.assertEqual(chapter_row.status, "planned")
            rows = db.execute(select(ProjectTask)).scalars().all()
        self.assertEqual(rows, [])

    def test_update_planned_chapter_with_non_empty_content_auto_moves_to_drafting(self) -> None:
        with self.SessionLocal() as db:
            chapter = db.get(Chapter, "c1")
            self.assertIsNotNone(chapter)
            chapter.status = "planned"
            chapter.content_md = ""
            db.commit()

        client = TestClient(self.app)
        with patch("app.db.session.SessionLocal", self.SessionLocal), patch(
            "app.services.task_queue.get_task_queue", return_value=_DummyQueue()
        ):
            resp = client.put(
                "/api/chapters/c1",
                headers={"X-Test-User": "u_owner"},
                json={"content_md": "new draft content"},
            )

        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertTrue(payload.get("ok"))
        chapter = (payload.get("data") or {}).get("chapter") or {}
        self.assertEqual(chapter.get("status"), "drafting")
        self.assertEqual(chapter.get("content_md"), "new draft content")

        with self.SessionLocal() as db:
            chapter_row = db.get(Chapter, "c1")
            self.assertIsNotNone(chapter_row)
            self.assertEqual(chapter_row.status, "drafting")
            rows = db.execute(select(ProjectTask)).scalars().all()
        self.assertEqual(rows, [])

    def test_status_endpoint_reopens_done_chapter_without_content_changes(self) -> None:
        with self.SessionLocal() as db:
            chapter = db.get(Chapter, "c1")
            self.assertIsNotNone(chapter)
            chapter.status = "done"
            chapter.content_md = "locked content"
            chapter.summary = "locked summary"
            db.commit()

        client = TestClient(self.app)
        with patch("app.db.session.SessionLocal", self.SessionLocal), patch(
            "app.services.task_queue.get_task_queue", return_value=_DummyQueue()
        ):
            resp = client.patch(
                "/api/chapters/c1/status",
                headers={"X-Test-User": "u_owner"},
                json={"status": "drafting", "expected_status": "done"},
            )

        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertTrue(payload.get("ok"))
        chapter = (payload.get("data") or {}).get("chapter") or {}
        self.assertEqual(chapter.get("status"), "drafting")
        self.assertEqual(chapter.get("content_md"), "locked content")
        self.assertEqual(chapter.get("summary"), "locked summary")

        with self.SessionLocal() as db:
            rows = db.execute(select(ProjectTask)).scalars().all()
        self.assertEqual(rows, [])

    def test_status_endpoint_rejects_invalid_transition(self) -> None:
        client = TestClient(self.app)
        with patch("app.db.session.SessionLocal", self.SessionLocal), patch(
            "app.services.task_queue.get_task_queue", return_value=_DummyQueue()
        ):
            resp = client.patch(
                "/api/chapters/c1/status",
                headers={"X-Test-User": "u_owner"},
                json={"status": "done", "expected_status": "planned"},
            )

        self.assertEqual(resp.status_code, 409)
        payload = resp.json()
        self.assertFalse(payload.get("ok"))
        error = payload.get("error") or {}
        self.assertEqual(error.get("code"), "CONFLICT")
        details = error.get("details") or {}
        self.assertEqual(details.get("reason"), "chapter_status_conflict")
        self.assertEqual(details.get("expected_status"), "planned")
        self.assertEqual(details.get("current_status"), "drafting")

    def test_status_endpoint_rejects_disallowed_transition(self) -> None:
        with self.SessionLocal() as db:
            chapter = db.get(Chapter, "c1")
            self.assertIsNotNone(chapter)
            chapter.status = "planned"
            db.commit()

        client = TestClient(self.app)
        with patch("app.db.session.SessionLocal", self.SessionLocal), patch(
            "app.services.task_queue.get_task_queue", return_value=_DummyQueue()
        ):
            resp = client.patch(
                "/api/chapters/c1/status",
                headers={"X-Test-User": "u_owner"},
                json={"status": "done", "expected_status": "planned"},
            )

        self.assertEqual(resp.status_code, 400)
        payload = resp.json()
        self.assertFalse(payload.get("ok"))
        error = payload.get("error") or {}
        self.assertEqual(error.get("code"), "VALIDATION_ERROR")
        details = error.get("details") or {}
        self.assertEqual(details.get("reason"), "invalid_chapter_status_transition")
        self.assertEqual(details.get("from_status"), "planned")
        self.assertEqual(details.get("to_status"), "done")

    def test_done_chapter_content_update_is_still_readonly(self) -> None:
        with self.SessionLocal() as db:
            chapter = db.get(Chapter, "c1")
            self.assertIsNotNone(chapter)
            chapter.status = "done"
            chapter.content_md = "locked content"
            db.commit()

        client = TestClient(self.app)
        with patch("app.db.session.SessionLocal", self.SessionLocal), patch(
            "app.services.task_queue.get_task_queue", return_value=_DummyQueue()
        ):
            resp = client.put(
                "/api/chapters/c1",
                headers={"X-Test-User": "u_owner"},
                json={"content_md": "changed"},
            )

        self.assertEqual(resp.status_code, 400)
        payload = resp.json()
        self.assertFalse(payload.get("ok"))
        error = payload.get("error") or {}
        self.assertEqual(error.get("code"), "VALIDATION_ERROR")
        self.assertEqual((error.get("details") or {}).get("reason"), "chapter_done_readonly")

        with self.SessionLocal() as db:
            chapter = db.get(Chapter, "c1")
            self.assertIsNotNone(chapter)
            self.assertEqual(chapter.status, "done")
            self.assertEqual(chapter.content_md, "locked content")
            rows = db.execute(select(ProjectTask)).scalars().all()
        self.assertEqual(rows, [])
