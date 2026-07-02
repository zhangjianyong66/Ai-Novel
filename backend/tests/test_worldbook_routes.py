from __future__ import annotations

import unittest
from datetime import datetime, timezone
from typing import Generator

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.testclient import TestClient

from app.api.routes import worldbook as worldbook_routes
from app.core.errors import AppError
from app.db.base import Base
from app.db.session import get_db
import app.models  # noqa: F401 - registers all SQLAlchemy models for create_all
from app.main import app_error_handler, validation_error_handler
from app.models.project import Project
from app.models.project_membership import ProjectMembership
from app.models.user import User
from app.models.worldbook_entry import WorldBookEntry


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

    def _override_get_db() -> Generator[Session, None, None]:
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    return app


class TestWorldBookRoutes(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.addCleanup(engine.dispose)
        Base.metadata.create_all(engine)
        self.SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        self.app = _make_test_app(self.SessionLocal)

        with self.SessionLocal() as db:
            db.add(User(id="u1", display_name="User 1", is_admin=False))
            db.flush()
            db.add(Project(id="p1", owner_user_id="u1", name="Project 1"))
            db.flush()
            db.add(ProjectMembership(project_id="p1", user_id="u1", role="owner"))
            db.add(
                WorldBookEntry(
                    id="w1",
                    project_id="p1",
                    title="Legacy",
                    content_md="legacy content",
                    enabled=True,
                    constant=False,
                    keywords_json="[]",
                    exclude_recursion=False,
                    prevent_recursion=False,
                    char_limit=12000,
                    priority="normal",
                    updated_at=datetime.now(timezone.utc),
                )
            )
            db.commit()

    def test_list_normalizes_legacy_priority_values(self) -> None:
        client = TestClient(self.app, raise_server_exceptions=False)

        res = client.get("/api/projects/p1/worldbook_entries", headers={"X-Test-User": "u1"})

        self.assertEqual(res.status_code, 200)
        entries = res.json()["data"]["worldbook_entries"]
        self.assertEqual(entries[0]["priority"], "important")


if __name__ == "__main__":
    unittest.main()
