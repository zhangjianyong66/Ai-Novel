from __future__ import annotations

import unittest
from typing import Generator

from fastapi import FastAPI, Request
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.testclient import TestClient

from app.api.routes import chapters as chapters_routes
from app.core.errors import AppError
from app.db.base import Base
from app.db.session import get_db
from app.main import app_error_handler
from app.models.chapter import Chapter
from app.models.chapter_version import ChapterVersion
from app.models.outline import Outline
from app.models.project import Project
from app.models.project_membership import ProjectMembership
from app.models.project_settings import ProjectSettings
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
    app.include_router(chapters_routes.router, prefix="/api")

    def _override_get_db() -> Generator[Session, None, None]:
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    return app


class TestChapterVersionRoutes(unittest.TestCase):
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
                ProjectMembership.__table__,
                ProjectSettings.__table__,
                ChapterVersion.__table__,
            ],
        )
        self.SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        self.app = _make_test_app(self.SessionLocal)

        with self.SessionLocal() as db:
            db.add_all(
                [
                    User(id="u_owner", display_name="owner"),
                    User(id="u_editor", display_name="editor"),
                    User(id="u_viewer", display_name="viewer"),
                ]
            )
            db.add(Project(id="p1", owner_user_id="u_owner", name="Project", genre=None, logline=None))
            db.add(Outline(id="o1", project_id="p1", title="Outline", content_md=None, structure_json=None))
            db.add(ProjectMembership(project_id="p1", user_id="u_editor", role="editor"))
            db.add(ProjectMembership(project_id="p1", user_id="u_viewer", role="viewer"))
            chapter = Chapter(
                id="c1",
                project_id="p1",
                outline_id="o1",
                number=1,
                title="第一章",
                plan="",
                content_md="当前正文",
                summary=None,
                status="drafting",
            )
            db.add(chapter)
            v1 = ChapterVersion(
                id="v1",
                project_id="p1",
                chapter_id="c1",
                source="manual_snapshot",
                content_md="旧正文",
                word_count=3,
            )
            v2 = ChapterVersion(
                id="v2",
                project_id="p1",
                chapter_id="c1",
                source="ai_generate",
                content_md="当前正文",
                word_count=4,
                generation_run_id="run-1",
                provider="openai_compatible",
                model="model-a",
            )
            db.add_all([v1, v2])
            db.flush()
            chapter.active_version_id = "v2"
            db.commit()

    def test_viewer_can_list_and_preview_versions(self) -> None:
        client = TestClient(self.app)

        listing = client.get("/api/chapters/c1/versions", headers={"X-Test-User": "u_viewer"})
        self.assertEqual(listing.status_code, 200)
        data = listing.json()["data"]
        self.assertEqual(data["active_version_id"], "v2")
        self.assertEqual([v["id"] for v in data["versions"]], ["v2", "v1"])
        self.assertNotIn("content_md", data["versions"][0])
        self.assertTrue(data["versions"][0]["is_active"])

        detail = client.get("/api/chapters/c1/versions/v1", headers={"X-Test-User": "u_viewer"})
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["data"]["version"]["content_md"], "旧正文")

    def test_viewer_cannot_activate_version_but_editor_can(self) -> None:
        client = TestClient(self.app)

        denied = client.post("/api/chapters/c1/versions/v1/activate", headers={"X-Test-User": "u_viewer"})
        self.assertEqual(denied.status_code, 403)

        activated = client.post("/api/chapters/c1/versions/v1/activate", headers={"X-Test-User": "u_editor"})
        self.assertEqual(activated.status_code, 200)
        data = activated.json()["data"]
        self.assertEqual(data["active_version"]["id"], "v1")
        self.assertEqual(data["chapter"]["content_md"], "旧正文")

        with self.SessionLocal() as db:
            chapter = db.get(Chapter, "c1")
            assert chapter is not None
            self.assertEqual(chapter.active_version_id, "v1")
            self.assertEqual(chapter.content_md, "旧正文")

    def test_done_chapter_cannot_activate_version(self) -> None:
        with self.SessionLocal() as db:
            chapter = db.get(Chapter, "c1")
            assert chapter is not None
            chapter.status = "done"
            db.commit()

        client = TestClient(self.app)
        resp = client.post("/api/chapters/c1/versions/v1/activate", headers={"X-Test-User": "u_editor"})
        self.assertEqual(resp.status_code, 400)
        err = resp.json()["error"]
        self.assertEqual(err["details"]["reason"], "chapter_done_readonly")

    def test_manual_content_save_clears_active_version_pointer(self) -> None:
        client = TestClient(self.app)
        resp = client.put(
            "/api/chapters/c1",
            headers={"X-Test-User": "u_editor"},
            json={"content_md": "手动修改正文"},
        )
        self.assertEqual(resp.status_code, 200)

        with self.SessionLocal() as db:
            chapter = db.get(Chapter, "c1")
            assert chapter is not None
            self.assertIsNone(chapter.active_version_id)
            self.assertEqual(chapter.content_md, "手动修改正文")


if __name__ == "__main__":
    unittest.main()
