from __future__ import annotations

import re
import unittest
from typing import Generator
from urllib.parse import unquote

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.testclient import TestClient

from app.api.routes import export as export_routes
from app.core.errors import AppError
from app.db.base import Base
from app.db.session import get_db
import app.models  # noqa: F401 - registers all SQLAlchemy models for create_all
from app.main import app_error_handler, validation_error_handler
from app.models.project import Project
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
    app.include_router(export_routes.router, prefix="/api")

    def _override_get_db() -> Generator[Session, None, None]:
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    return app


def _filename_star(response_header: str) -> str:
    match = re.search(r"filename\*=UTF-8''([^;]+)", response_header)
    if not match:
        raise AssertionError(f"missing filename*: {response_header}")
    return unquote(match.group(1))


class TestExportDownloadFilenames(unittest.TestCase):
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
            db.add(Project(id="p1", owner_user_id="u1", name="小说/世界", genre=None, logline=None))
            db.commit()

    def test_markdown_download_filename_includes_timestamp_before_extension(self) -> None:
        client = TestClient(self.app)

        res = client.get("/api/projects/p1/export/markdown", headers={"X-Test-User": "u1"})

        self.assertEqual(res.status_code, 200)
        filename = _filename_star(res.headers.get("Content-Disposition", ""))
        self.assertRegex(filename, r"^小说_世界_\d{14}\.md$")

    def test_bundle_download_filename_includes_timestamp_before_bundle_suffix(self) -> None:
        client = TestClient(self.app)

        res = client.get("/api/projects/p1/export/bundle", headers={"X-Test-User": "u1"})

        self.assertEqual(res.status_code, 200)
        filename = _filename_star(res.headers.get("Content-Disposition", ""))
        self.assertRegex(filename, r"^小说_世界_\d{14}\.bundle\.json$")


if __name__ == "__main__":
    unittest.main()
