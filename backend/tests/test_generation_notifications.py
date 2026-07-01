from __future__ import annotations

import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.generation_run import GenerationRun
from app.models.project import Project
from app.models.user import User
from app.models.user_notification_settings import UserNotificationSettings


class TestGenerationNotifications(unittest.TestCase):
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
                GenerationRun.__table__,
                UserNotificationSettings.__table__,
            ],
        )
        self.SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

        with self.SessionLocal() as db:
            db.add(User(id="u1", display_name="user"))
            db.add(Project(id="p1", owner_user_id="u1", name="Project 1", genre=None, logline=None))
            db.commit()

    def test_write_generation_run_notifies_success_and_notification_failure_is_fail_soft(self) -> None:
        from app.services import run_store

        with patch.object(run_store, "SessionLocal", self.SessionLocal):
            with patch.object(run_store, "bump_user_generation_usage"):
                with patch.object(run_store, "notify_generation_finished_fail_soft") as notify:
                    run_id = run_store.write_generation_run(
                        request_id="rid",
                        actor_user_id="u1",
                        project_id="p1",
                        chapter_id=None,
                        run_type="outline_generate",
                        provider="openai",
                        model="gpt-test",
                        prompt_system="sys",
                        prompt_user="user",
                        prompt_render_log_json=None,
                        params_json="{}",
                        output_text="ok",
                        error_json=None,
                    )

        self.assertTrue(run_id)
        notify.assert_called_once()
        event = notify.call_args.kwargs["event"]
        self.assertEqual(event.actor_user_id, "u1")
        self.assertEqual(event.project_id, "p1")
        self.assertEqual(event.generation_run_id, run_id)
        self.assertEqual(event.task_type, "outline_generate")
        self.assertEqual(event.status, "success")


if __name__ == "__main__":
    unittest.main()
