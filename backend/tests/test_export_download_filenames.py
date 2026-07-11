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
from app.models.chapter import Chapter
from app.models.outline import Outline
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

    def test_txt_download_filename_includes_timestamp_before_extension(self) -> None:
        client = TestClient(self.app)

        res = client.get("/api/projects/p1/export/txt", headers={"X-Test-User": "u1"})

        self.assertEqual(res.status_code, 200)
        filename = _filename_star(res.headers.get("Content-Disposition", ""))
        self.assertRegex(filename, r"^小说_世界_\d{14}\.txt$")

    def test_txt_export_contains_only_chapter_content_in_number_order(self) -> None:
        with self.SessionLocal() as db:
            outline = Outline(id="o1", project_id="p1", title="大纲", content_md="不应出现在 TXT 中")
            project = db.get(Project, "p1")
            assert project is not None
            project.active_outline_id = "o1"
            db.add(outline)
            db.add_all(
                [
                    Chapter(
                        id="c2",
                        project_id="p1",
                        outline_id="o1",
                        number=2,
                        title="第二章",
                        status="drafting",
                        content_md="第二章正文",
                    ),
                    Chapter(
                        id="c1",
                        project_id="p1",
                        outline_id="o1",
                        number=1,
                        title="第一章",
                        status="done",
                        content_md="第一章正文",
                    ),
                ]
            )
            db.commit()

        client = TestClient(self.app)

        res = client.get("/api/projects/p1/export/txt?chapters=all", headers={"X-Test-User": "u1"})

        self.assertEqual(res.status_code, 200)
        self.assertIn("text/plain", res.headers.get("Content-Type", ""))
        self.assertEqual(res.text, "《小说/世界》\n\n第1章 第一章\n\n第一章正文\n\n第2章 第二章\n\n第二章正文\n")
        self.assertNotIn("不应出现在 TXT 中", res.text)

    def test_txt_export_can_limit_to_done_chapters(self) -> None:
        with self.SessionLocal() as db:
            outline = Outline(id="o1", project_id="p1", title="大纲", content_md="")
            project = db.get(Project, "p1")
            assert project is not None
            project.active_outline_id = "o1"
            db.add(outline)
            db.add_all(
                [
                    Chapter(
                        id="c1",
                        project_id="p1",
                        outline_id="o1",
                        number=1,
                        title="已定稿",
                        status="done",
                        content_md="已定稿正文",
                    ),
                    Chapter(
                        id="c2",
                        project_id="p1",
                        outline_id="o1",
                        number=2,
                        title="草稿",
                        status="drafting",
                        content_md="草稿正文",
                    ),
                ]
            )
            db.commit()

        client = TestClient(self.app)

        res = client.get("/api/projects/p1/export/txt?chapters=done", headers={"X-Test-User": "u1"})

        self.assertEqual(res.status_code, 200)
        self.assertIn("已定稿正文", res.text)
        self.assertNotIn("草稿正文", res.text)

    def test_markdown_export_can_limit_to_selected_chapters(self) -> None:
        with self.SessionLocal() as db:
            outline = Outline(id="o1", project_id="p1", title="大纲", content_md="大纲内容")
            project = db.get(Project, "p1")
            assert project is not None
            project.active_outline_id = "o1"
            db.add(outline)
            db.add_all(
                [
                    Chapter(
                        id="c2",
                        project_id="p1",
                        outline_id="o1",
                        number=2,
                        title="第二章",
                        status="drafting",
                        content_md="第二章正文",
                    ),
                    Chapter(
                        id="c1",
                        project_id="p1",
                        outline_id="o1",
                        number=1,
                        title="第一章",
                        status="done",
                        content_md="第一章正文",
                    ),
                    Chapter(
                        id="c3",
                        project_id="p1",
                        outline_id="o1",
                        number=3,
                        title="第三章",
                        status="done",
                        content_md="第三章正文",
                    ),
                ]
            )
            db.commit()

        client = TestClient(self.app)

        res = client.get(
            "/api/projects/p1/export/markdown?chapters=selected&chapter_ids=c3&chapter_ids=c1",
            headers={"X-Test-User": "u1"},
        )

        self.assertEqual(res.status_code, 200)
        self.assertIn("### 第1章 第一章", res.text)
        self.assertIn("第一章正文", res.text)
        self.assertIn("### 第3章 第三章", res.text)
        self.assertIn("第三章正文", res.text)
        self.assertNotIn("第二章正文", res.text)
        self.assertLess(res.text.index("### 第1章 第一章"), res.text.index("### 第3章 第三章"))

    def test_txt_export_can_limit_to_selected_chapters(self) -> None:
        with self.SessionLocal() as db:
            outline = Outline(id="o1", project_id="p1", title="大纲", content_md="")
            project = db.get(Project, "p1")
            assert project is not None
            project.active_outline_id = "o1"
            db.add(outline)
            db.add_all(
                [
                    Chapter(
                        id="c1",
                        project_id="p1",
                        outline_id="o1",
                        number=1,
                        title="第一章",
                        status="done",
                        content_md="第一章正文",
                    ),
                    Chapter(
                        id="c2",
                        project_id="p1",
                        outline_id="o1",
                        number=2,
                        title="第二章",
                        status="drafting",
                        content_md="第二章正文",
                    ),
                    Chapter(
                        id="c3",
                        project_id="p1",
                        outline_id="o1",
                        number=3,
                        title="第三章",
                        status="done",
                        content_md="第三章正文",
                    ),
                ]
            )
            db.commit()

        client = TestClient(self.app)

        res = client.get(
            "/api/projects/p1/export/txt?chapters=selected&chapter_ids=c3&chapter_ids=c1",
            headers={"X-Test-User": "u1"},
        )

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.text, "《小说/世界》\n\n第1章 第一章\n\n第一章正文\n\n第3章 第三章\n\n第三章正文\n")

    def test_selected_export_rejects_empty_chapter_ids(self) -> None:
        client = TestClient(self.app)

        res = client.get("/api/projects/p1/export/txt?chapters=selected", headers={"X-Test-User": "u1"})

        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["error"]["code"], "VALIDATION_ERROR")
        self.assertEqual(res.json()["error"]["details"]["reason"], "selected_chapters_required")

    def test_selected_export_rejects_chapters_outside_active_outline(self) -> None:
        with self.SessionLocal() as db:
            db.add(User(id="u2", display_name="User 2", is_admin=False))
            db.add(Project(id="p2", owner_user_id="u2", name="其他项目", genre=None, logline=None))
            outline = Outline(id="o1", project_id="p1", title="当前大纲", content_md="")
            other_outline = Outline(id="o2", project_id="p1", title="其他大纲", content_md="")
            foreign_outline = Outline(id="o3", project_id="p2", title="其他项目大纲", content_md="")
            project = db.get(Project, "p1")
            assert project is not None
            project.active_outline_id = "o1"
            db.add_all([outline, other_outline, foreign_outline])
            db.add_all(
                [
                    Chapter(
                        id="c1",
                        project_id="p1",
                        outline_id="o1",
                        number=1,
                        title="当前章节",
                        status="done",
                        content_md="当前正文",
                    ),
                    Chapter(
                        id="c2",
                        project_id="p1",
                        outline_id="o2",
                        number=2,
                        title="其他大纲章节",
                        status="done",
                        content_md="不应导出",
                    ),
                    Chapter(
                        id="c3",
                        project_id="p2",
                        outline_id="o3",
                        number=1,
                        title="其他项目章节",
                        status="done",
                        content_md="不应导出",
                    ),
                ]
            )
            db.commit()

        client = TestClient(self.app)

        res = client.get(
            "/api/projects/p1/export/txt?chapters=selected&chapter_ids=c1&chapter_ids=c2&chapter_ids=c3",
            headers={"X-Test-User": "u1"},
        )

        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["error"]["code"], "VALIDATION_ERROR")
        self.assertEqual(res.json()["error"]["details"]["reason"], "selected_chapters_invalid")

    def test_bundle_download_filename_includes_timestamp_before_bundle_suffix(self) -> None:
        client = TestClient(self.app)

        res = client.get("/api/projects/p1/export/bundle", headers={"X-Test-User": "u1"})

        self.assertEqual(res.status_code, 200)
        filename = _filename_star(res.headers.get("Content-Disposition", ""))
        self.assertRegex(filename, r"^小说_世界_\d{14}\.bundle\.json$")


if __name__ == "__main__":
    unittest.main()
