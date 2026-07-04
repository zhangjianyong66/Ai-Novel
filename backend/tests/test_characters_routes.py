from __future__ import annotations

import unittest
from typing import Generator
from unittest.mock import patch

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.testclient import TestClient

from app.api.routes import characters as characters_routes
from app.core.errors import AppError
from app.db.base import Base
from app.db.session import get_db
from app.main import app_error_handler, validation_error_handler
from app.models.character import Character
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
    app.include_router(characters_routes.router, prefix="/api")

    def _override_get_db() -> Generator[Session, None, None]:
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    return app


class TestCharactersRoutes(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.addCleanup(engine.dispose)
        Base.metadata.create_all(engine, tables=[User.__table__, Project.__table__, Character.__table__])
        self.SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        self.app = _make_test_app(self.SessionLocal)

        with self.SessionLocal() as db:
            db.add(User(id="u_owner", display_name="owner"))
            db.add(Project(id="p1", owner_user_id="u_owner", name="Project 1", genre=None, logline=None))
            db.add(
                Character(
                    id="ch1",
                    project_id="p1",
                    name="Alice",
                    role="主角",
                    profile="人物档案",
                    notes="旧备注",
                )
            )
            db.commit()

    def test_update_character_can_clear_notes_with_null(self) -> None:
        client = TestClient(self.app)

        with patch("app.api.routes.characters.schedule_search_rebuild_task"):
            resp = client.put("/api/characters/ch1", headers={"X-Test-User": "u_owner"}, json={"notes": None})

        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.json()["data"]["character"]["notes"])
        with self.SessionLocal() as db:
            saved = db.get(Character, "ch1")
            self.assertIsNotNone(saved)
            self.assertIsNone(saved.notes)


if __name__ == "__main__":
    unittest.main()
