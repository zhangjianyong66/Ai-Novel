from __future__ import annotations

import unittest
from typing import Generator

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.testclient import TestClient

from app.api.routes import outlines as outlines_routes
from app.core.errors import AppError
from app.db.base import Base
from app.db.session import get_db
from app.main import app_error_handler, validation_error_handler
from app.models.project import Project
from app.models.outline_generation_preference import ProjectOutlineGenerationPreference
from app.models.project_membership import ProjectMembership
from app.models.user import User
from app.services.outline_generation_preferences import save_outline_generation_preferences


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

    def _override_get_db() -> Generator[Session, None, None]:
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    return app


class TestOutlineGenerationPreferences(unittest.TestCase):
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
                ProjectMembership.__table__,
                ProjectOutlineGenerationPreference.__table__,
            ],
        )
        self.SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        self.app = _make_test_app(self.SessionLocal)
        self.client = TestClient(self.app)

        with self.SessionLocal() as db:
            db.add(User(id="u_owner", display_name="owner"))
            db.add(User(id="u_viewer", display_name="viewer"))
            db.add(User(id="u_other", display_name="other"))
            db.add(Project(id="p1", owner_user_id="u_owner", name="Project 1", genre=None, logline=None))
            db.add(Project(id="p2", owner_user_id="u_other", name="Project 2", genre=None, logline=None))
            db.add(ProjectMembership(project_id="p1", user_id="u_viewer", role="viewer"))
            db.commit()

    def test_post_saves_trimmed_preferences_and_get_returns_recent_first(self) -> None:
        first = self.client.post(
            "/api/projects/p1/outline/generation-preferences",
            headers={"X-Test-User": "u_owner"},
            json={"tone": "  自定义基调 A  ", "pacing": "自定义节奏 A"},
        )
        self.assertEqual(first.status_code, 200)

        second = self.client.post(
            "/api/projects/p1/outline/generation-preferences",
            headers={"X-Test-User": "u_owner"},
            json={"tone": "自定义基调 B", "pacing": "自定义节奏 B"},
        )
        self.assertEqual(second.status_code, 200)

        reused = self.client.post(
            "/api/projects/p1/outline/generation-preferences",
            headers={"X-Test-User": "u_owner"},
            json={"tone": "自定义基调 A", "pacing": "自定义节奏 A"},
        )
        self.assertEqual(reused.status_code, 200)

        got = self.client.get("/api/projects/p1/outline/generation-preferences", headers={"X-Test-User": "u_owner"})
        self.assertEqual(got.status_code, 200)
        preferences = got.json()["data"]["preferences"]
        self.assertEqual(preferences["tone"], ["自定义基调 A", "自定义基调 B"])
        self.assertEqual(preferences["pacing"], ["自定义节奏 A", "自定义节奏 B"])

    def test_viewer_can_read_but_cannot_save_preferences(self) -> None:
        got = self.client.get("/api/projects/p1/outline/generation-preferences", headers={"X-Test-User": "u_viewer"})
        self.assertEqual(got.status_code, 200)

        saved = self.client.post(
            "/api/projects/p1/outline/generation-preferences",
            headers={"X-Test-User": "u_viewer"},
            json={"tone": "viewer tone", "pacing": "viewer pacing"},
        )
        self.assertEqual(saved.status_code, 403)

    def test_preferences_are_scoped_by_user_and_project(self) -> None:
        owner_saved = self.client.post(
            "/api/projects/p1/outline/generation-preferences",
            headers={"X-Test-User": "u_owner"},
            json={"tone": "owner tone", "pacing": "owner pacing"},
        )
        self.assertEqual(owner_saved.status_code, 200)

        other_saved = self.client.post(
            "/api/projects/p2/outline/generation-preferences",
            headers={"X-Test-User": "u_other"},
            json={"tone": "other tone", "pacing": "other pacing"},
        )
        self.assertEqual(other_saved.status_code, 200)

        viewer_got = self.client.get("/api/projects/p1/outline/generation-preferences", headers={"X-Test-User": "u_viewer"})
        self.assertEqual(viewer_got.status_code, 200)
        self.assertEqual(viewer_got.json()["data"]["preferences"], {"tone": [], "pacing": []})

        owner_got = self.client.get("/api/projects/p1/outline/generation-preferences", headers={"X-Test-User": "u_owner"})
        self.assertEqual(owner_got.json()["data"]["preferences"], {"tone": ["owner tone"], "pacing": ["owner pacing"]})

    def test_service_prunes_old_preferences_by_field_limit(self) -> None:
        with self.SessionLocal() as db:
            save_outline_generation_preferences(db, project_id="p1", user_id="u_owner", tone="tone 1", limit=2)
            save_outline_generation_preferences(db, project_id="p1", user_id="u_owner", tone="tone 2", limit=2)
            save_outline_generation_preferences(db, project_id="p1", user_id="u_owner", tone="tone 3", limit=2)

        got = self.client.get("/api/projects/p1/outline/generation-preferences", headers={"X-Test-User": "u_owner"})
        self.assertEqual(got.status_code, 200)
        self.assertEqual(got.json()["data"]["preferences"]["tone"], ["tone 3", "tone 2"])


if __name__ == "__main__":
    unittest.main()
