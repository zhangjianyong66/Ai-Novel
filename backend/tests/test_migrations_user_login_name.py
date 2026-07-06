from __future__ import annotations

import os
import sqlite3
import tempfile
import unittest
from pathlib import Path

from alembic import command

from app.db import migrations


class TestUserLoginNameMigration(unittest.TestCase):
    def test_backfills_login_name_from_existing_user_ids(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            db_path = Path(td) / "login_name.db"
            database_url = f"sqlite:///{db_path.as_posix()}"
            cfg = migrations._alembic_config(database_url=database_url)

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
                now = "2026-07-06T00:00:00+00:00"
                conn.execute(
                    """
                    INSERT INTO users (id, email, password_hash, display_name, is_admin, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    ("Alice", None, None, "Alice", 0, now, now),
                )
                conn.execute(
                    """
                    INSERT INTO users (id, email, password_hash, display_name, is_admin, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    ("alice", None, None, "alice", 0, now, now),
                )
                conn.commit()
            finally:
                conn.close()

            prev = os.environ.get("DATABASE_URL")
            os.environ["DATABASE_URL"] = database_url
            try:
                command.upgrade(cfg, "head")
            finally:
                if prev is None:
                    os.environ.pop("DATABASE_URL", None)
                else:
                    os.environ["DATABASE_URL"] = prev

            conn = sqlite3.connect(str(db_path))
            try:
                cols = {r[1]: r for r in conn.execute("PRAGMA table_info(users)").fetchall()}
                self.assertIn("login_name", cols)
                self.assertEqual(int(cols["login_name"][3]), 1)
                rows = dict(conn.execute("SELECT id, login_name FROM users ORDER BY id").fetchall())
                self.assertEqual(rows["Alice"], "alice")
                self.assertEqual(rows["alice"], "alice_2")
                indexes = [r[1] for r in conn.execute("PRAGMA index_list(users)").fetchall()]
                self.assertIn("ix_users_login_name", indexes)
            finally:
                conn.close()


if __name__ == "__main__":
    unittest.main()
