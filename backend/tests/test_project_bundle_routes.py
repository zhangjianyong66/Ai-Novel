from __future__ import annotations

import unittest
from typing import Generator

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.testclient import TestClient

from app.api.routes import projects as projects_routes
from app.core.config import settings
from app.core.errors import AppError
from app.db.base import Base
from app.db.session import get_db
import app.models  # noqa: F401 - registers all SQLAlchemy models for create_all
from app.main import app_error_handler, validation_error_handler
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
    app.include_router(projects_routes.router, prefix="/api")

    def _override_get_db() -> Generator[Session, None, None]:
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    return app


class TestProjectBundleRoutes(unittest.TestCase):
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
        self._old_limit = getattr(settings, "project_bundle_import_max_bytes", None)
        self.addCleanup(self._restore_limit)

        with self.SessionLocal() as db:
            db.add(User(id="u1", display_name="User 1", is_admin=False))
            db.commit()

    def _restore_limit(self) -> None:
        if self._old_limit is not None:
            settings.project_bundle_import_max_bytes = self._old_limit

    def test_import_bundle_config_exposes_limit_and_schema(self) -> None:
        settings.project_bundle_import_max_bytes = 12345
        client = TestClient(self.app)

        res = client.get("/api/projects/import_bundle/config", headers={"X-Test-User": "u1"})

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["data"], {"max_bytes": 12345, "schema_version": "project_bundle_v1"})

    def test_import_bundle_rejects_payload_above_configured_limit(self) -> None:
        settings.project_bundle_import_max_bytes = 10
        client = TestClient(self.app)

        res = client.post(
            "/api/projects/import_bundle",
            headers={"X-Test-User": "u1"},
            json={"bundle": {"schema_version": "project_bundle_v1", "project": {"name": "Project 1"}}},
        )

        self.assertEqual(res.status_code, 400)
        body = res.json()
        self.assertEqual(body["error"]["code"], "VALIDATION_ERROR")
        self.assertEqual(body["error"]["details"]["reason"], "project_bundle_too_large")
        self.assertEqual(body["error"]["details"]["max_bytes"], 10)


if __name__ == "__main__":
    unittest.main()
