from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.testclient import TestClient

from app.api.routes import worldbook as worldbook_routes
from app.core.errors import AppError
from app.db.base import Base
from app.main import app_error_handler, validation_error_handler
from app.models.chapter import Chapter
from app.models.outline import Outline
from app.models.project import Project
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
    app.include_router(worldbook_routes.router, prefix="/api")

    return app


class TestWorldbookAutoUpdateEndpoint(unittest.TestCase):
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
                ProjectTask.__table__,
                ProjectTaskEvent.__table__,
            ],
        )

        self.SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        self.app = _make_test_app(self.SessionLocal)

        with self.SessionLocal() as db:
            db.add(User(id="u_owner", display_name="owner"))
            db.add(Project(id="p1", owner_user_id="u_owner", name="Project 1", genre=None, logline=None))
            db.add(Outline(id="o1", project_id="p1", title="Outline 1", content_md=None, structure_json=None))
            db.commit()

    def test_manual_trigger_without_done_chapter_rejects_and_does_not_create_project_task(self) -> None:
        client = TestClient(self.app)
        with patch("app.db.session.SessionLocal", self.SessionLocal), patch(
            "app.services.task_queue.get_task_queue", return_value=_DummyQueue()
        ):
            resp = client.post("/api/projects/p1/worldbook_entries/auto_update", headers={"X-Test-User": "u_owner"})

        self.assertEqual(resp.status_code, 400)
        payload = resp.json()
        self.assertFalse(payload.get("ok"))
        error = payload.get("error") or {}
        self.assertEqual((error.get("details") or {}).get("reason"), "no_done_chapter")

        with self.SessionLocal() as db:
            tasks = db.execute(select(ProjectTask)).scalars().all()
            self.assertEqual(tasks, [])

    def test_manual_trigger_uses_latest_done_chapter_when_chapter_id_is_omitted(self) -> None:
        with self.SessionLocal() as db:
            db.add(
                Chapter(
                    id="c-old",
                    project_id="p1",
                    outline_id="o1",
                    number=1,
                    title="Old",
                    content_md="old content",
                    summary="old summary",
                    status="done",
                    updated_at=datetime(2026, 7, 2, 1, 0, 0, tzinfo=timezone.utc),
                )
            )
            db.add(
                Chapter(
                    id="c-latest",
                    project_id="p1",
                    outline_id="o1",
                    number=2,
                    title="Latest",
                    content_md="latest content",
                    summary="latest summary",
                    status="done",
                    updated_at=datetime(2026, 7, 2, 2, 0, 0, tzinfo=timezone.utc),
                )
            )
            db.commit()

        client = TestClient(self.app)
        with patch("app.db.session.SessionLocal", self.SessionLocal), patch(
            "app.services.task_queue.get_task_queue", return_value=_DummyQueue()
        ):
            resp = client.post("/api/projects/p1/worldbook_entries/auto_update", headers={"X-Test-User": "u_owner"})

        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertTrue(payload.get("ok"))
        data = payload.get("data") or {}
        self.assertEqual(data.get("chapter_id"), "c-latest")

        with self.SessionLocal() as db:
            task = db.execute(select(ProjectTask)).scalars().one()
            self.assertIn("worldbook:chapter:c-latest:", str(task.idempotency_key))
