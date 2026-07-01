from __future__ import annotations

import unittest
from typing import Generator

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.testclient import TestClient

from app.api.router import api_router
from app.core.errors import AppError
from app.db.base import Base
from app.db.session import get_db
from app.main import app_error_handler, validation_error_handler
from app.models.user import User
from app.models.user_notification_settings import UserNotificationSettings


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
    app.include_router(api_router)

    def _override_get_db() -> Generator[Session, None, None]:
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    return app


class TestNotificationSettingsRoute(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.addCleanup(engine.dispose)
        Base.metadata.create_all(engine, tables=[User.__table__, UserNotificationSettings.__table__])
        self.SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        self.app = _make_test_app(self.SessionLocal)
        self.client = TestClient(self.app)

        with self.SessionLocal() as db:
            db.add(User(id="u1", display_name="user"))
            db.commit()

    def test_get_defaults_to_all_notifications_disabled(self) -> None:
        res = self.client.get("/api/me/notification-settings", headers={"X-Test-User": "u1"})

        self.assertEqual(res.status_code, 200)
        settings = res.json()["data"]["settings"]
        self.assertFalse(settings["browser_enabled"])
        self.assertFalse(settings["feishu_enabled"])
        self.assertFalse(settings["feishu_webhook_configured"])
        self.assertEqual(settings["feishu_webhook_masked"], "")
        self.assertNotIn("feishu_webhook_url", settings)


if __name__ == "__main__":
    unittest.main()
