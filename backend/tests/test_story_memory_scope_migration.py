from __future__ import annotations

import os
import sqlite3
import tempfile
import unittest
from pathlib import Path

from alembic import command

from app.db import migrations


class TestStoryMemoryScopeMigration(unittest.TestCase):
    def test_backfills_outline_scope_and_leaves_unassigned_history(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            db_path = Path(td) / "story_memory_scope.db"
            database_url = f"sqlite:///{db_path.as_posix()}"
            cfg = migrations._alembic_config(database_url=database_url)

            prev = os.environ.get("DATABASE_URL")
            os.environ["DATABASE_URL"] = database_url
            try:
                command.upgrade(cfg, "b4c7f1e9a203")
            finally:
                if prev is None:
                    os.environ.pop("DATABASE_URL", None)
                else:
                    os.environ["DATABASE_URL"] = prev

            conn = sqlite3.connect(str(db_path))
            try:
                # Simulate historical dirty data where a story memory references a chapter that
                # no longer exists. SQLite tests must disable FK checks to seed that state.
                conn.execute("PRAGMA foreign_keys=OFF;")
                now = "2026-07-05T00:00:00+00:00"
                conn.execute(
                    """
                    INSERT INTO users (id, email, password_hash, display_name, is_admin, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    ("u1", None, None, "User 1", 0, now, now),
                )
                conn.execute(
                    """
                    INSERT INTO projects (id, owner_user_id, active_outline_id, llm_profile_id, name, genre, logline, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    ("p1", "u1", None, None, "Project 1", None, None, now, now),
                )
                conn.execute(
                    """
                    INSERT INTO outlines (id, project_id, title, content_md, structure_json, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    ("o1", "p1", "Outline 1", "", None, now, now),
                )
                conn.execute("UPDATE projects SET active_outline_id = ? WHERE id = ?", ("o1", "p1"))
                conn.execute(
                    """
                    INSERT INTO chapters (id, project_id, outline_id, number, title, plan, content_md, summary, status, active_version_id, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    ("c1", "p1", "o1", 1, "Chapter 1", "", "", "", "planned", None, now),
                )
                for memory_id, chapter_id, content in [
                    ("from-chapter", "c1", "章节来源记忆"),
                    ("no-chapter", None, "无章节历史记忆"),
                    ("lost-chapter", "missing", "失效章节历史记忆"),
                ]:
                    conn.execute(
                        """
                        INSERT INTO story_memories (
                            id, project_id, chapter_id, memory_type, title, content, full_context_md,
                            importance_score, tags_json, story_timeline, text_position, text_length,
                            is_foreshadow, foreshadow_resolved_at_chapter_id, metadata_json, created_at, updated_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            memory_id,
                            "p1",
                            chapter_id,
                            "plot_point",
                            memory_id,
                            content,
                            None,
                            1.0,
                            None,
                            0,
                            -1,
                            0,
                            0,
                            None,
                            None,
                            now,
                            now,
                        ),
                    )
                conn.commit()
            finally:
                conn.close()

            prev = os.environ.get("DATABASE_URL")
            os.environ["DATABASE_URL"] = database_url
            try:
                command.upgrade(cfg, "c2f7a9d4e6b8")
            finally:
                if prev is None:
                    os.environ.pop("DATABASE_URL", None)
                else:
                    os.environ["DATABASE_URL"] = prev

            conn = sqlite3.connect(str(db_path))
            try:
                rows = {
                    row[0]: {"scope": row[1], "outline_id": row[2]}
                    for row in conn.execute(
                        "SELECT id, scope, outline_id FROM story_memories ORDER BY id"
                    ).fetchall()
                }
            finally:
                conn.close()

            self.assertEqual(rows["from-chapter"], {"scope": "outline", "outline_id": "o1"})
            self.assertEqual(rows["no-chapter"], {"scope": "unassigned", "outline_id": None})
            self.assertEqual(rows["lost-chapter"], {"scope": "unassigned", "outline_id": None})


if __name__ == "__main__":
    unittest.main()
