from __future__ import annotations

import unittest
from typing import Generator

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.testclient import TestClient

from app.api.routes import memory as memory_routes
from app.core.errors import AppError
from app.db.base import Base
from app.db.session import get_db
from app.db.utils import utc_now
from app.main import app_error_handler, validation_error_handler
from app.models.chapter import Chapter
from app.models.generation_run import GenerationRun
from app.models.outline import Outline
from app.models.project import Project
from app.models.project_membership import ProjectMembership
from app.models.project_settings import ProjectSettings
from app.models.structured_memory import MemoryChangeSet, MemoryChangeSetItem, MemoryEntity, MemoryEvidence, MemoryRelation
from app.models.user import User
from app.services.memory_update_service import normalize_character_entity_duplicates


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
    app.include_router(memory_routes.router, prefix="/api")

    def _override_get_db() -> Generator[Session, None, None]:
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    return app


class TestStructuredMemoryRestoreOnCreate(unittest.TestCase):
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
                GenerationRun.__table__,
                MemoryEntity.__table__,
                MemoryRelation.__table__,
                MemoryEvidence.__table__,
                MemoryChangeSet.__table__,
                MemoryChangeSetItem.__table__,
                ProjectSettings.__table__,
            ],
        )
        self.SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        self.app = _make_test_app(self.SessionLocal)

        with self.SessionLocal() as db:
            db.add_all(
                [
                    User(id="u_owner", display_name="owner"),
                    User(id="u_editor", display_name="editor"),
                ]
            )
            db.add(Project(id="p1", owner_user_id="u_owner", name="Project 1", genre=None, logline=None))
            db.add(ProjectMembership(project_id="p1", user_id="u_editor", role="editor"))
            db.add(Outline(id="o1", project_id="p1", title="Outline", content_md=None, structure_json=None))
            db.add(Chapter(id="c1", project_id="p1", outline_id="o1", number=1, title="Ch1", status="done"))
            db.add(
                MemoryEntity(
                    id="e_alice",
                    project_id="p1",
                    entity_type="character",
                    name="Alice",
                    summary_md=None,
                    attributes_json=None,
                    deleted_at=utc_now(),
                )
            )
            db.commit()

    def test_propose_and_apply_restores_soft_deleted_entity_without_target_id(self) -> None:
        client = TestClient(self.app)
        propose = client.post(
            "/api/chapters/c1/memory/propose",
            headers={"X-Test-User": "u_editor"},
            json={
                "schema_version": "memory_update_v1",
                "idempotency_key": "key-restore-entity-1",
                "ops": [
                    {
                        "op": "upsert",
                        "target_table": "entities",
                        "after": {"entity_type": "character", "name": "Alice", "attributes": {"age": 18}},
                    }
                ],
            },
        )
        self.assertEqual(propose.status_code, 200)
        items = propose.json()["data"]["items"]
        self.assertEqual(items[0]["target_id"], "e_alice")

        change_set_id = propose.json()["data"]["change_set"]["id"]
        apply_ok = client.post(
            f"/api/memory_change_sets/{change_set_id}/apply",
            headers={"X-Test-User": "u_editor"},
        )
        self.assertEqual(apply_ok.status_code, 200)

        with self.SessionLocal() as db:
            e = db.get(MemoryEntity, "e_alice")
            self.assertIsNotNone(e)
            self.assertIsNone(e.deleted_at)
            self.assertIsNotNone(e.attributes_json)

    def test_propose_reuses_historical_person_entity_as_character_after_normalization(self) -> None:
        with self.SessionLocal() as db:
            db.add(
                MemoryEntity(
                    id="e_pan_yue_person",
                    project_id="p1",
                    entity_type="person",
                    name="潘越",
                    summary_md=None,
                    attributes_json=None,
                    deleted_at=None,
                )
            )
            db.commit()

        client = TestClient(self.app)
        propose = client.post(
            "/api/chapters/c1/memory/propose",
            headers={"X-Test-User": "u_editor"},
            json={
                "schema_version": "memory_update_v1",
                "idempotency_key": "key-restore-person-character-1",
                "ops": [
                    {
                        "op": "upsert",
                        "target_table": "entities",
                        "after": {"entity_type": "person", "name": "潘越", "summary_md": "主角之一"},
                    }
                ],
            },
        )
        self.assertEqual(propose.status_code, 200)
        items = propose.json()["data"]["items"]
        self.assertEqual(items[0]["target_id"], "e_pan_yue_person")
        self.assertIn('"entity_type":"character"', items[0]["after_json"])

        change_set_id = propose.json()["data"]["change_set"]["id"]
        apply_ok = client.post(
            f"/api/memory_change_sets/{change_set_id}/apply",
            headers={"X-Test-User": "u_editor"},
        )
        self.assertEqual(apply_ok.status_code, 200)

        with self.SessionLocal() as db:
            e = db.get(MemoryEntity, "e_pan_yue_person")
            self.assertIsNotNone(e)
            self.assertEqual(e.entity_type, "character")
            self.assertEqual(e.name, "潘越")

    def test_propose_reuses_historical_object_entity_as_artifact_after_normalization(self) -> None:
        with self.SessionLocal() as db:
            db.add(
                MemoryEntity(
                    id="ticket_midi",
                    project_id="p1",
                    entity_type="object",
                    name="迷笛音乐节旧门票",
                    summary_md="四年前迷笛音乐节门票",
                    attributes_json=None,
                    deleted_at=None,
                )
            )
            db.commit()

        client = TestClient(self.app)
        propose = client.post(
            "/api/chapters/c1/memory/propose",
            headers={"X-Test-User": "u_editor"},
            json={
                "schema_version": "memory_update_v1",
                "idempotency_key": "key-restore-object-artifact-1",
                "ops": [
                    {
                        "op": "upsert",
                        "target_table": "entities",
                        "after": {"entity_type": "object", "name": "迷笛音乐节旧门票", "summary_md": "有剧情意义的旧门票"},
                    }
                ],
            },
        )
        self.assertEqual(propose.status_code, 200)
        items = propose.json()["data"]["items"]
        self.assertEqual(items[0]["target_id"], "ticket_midi")
        self.assertIn('"entity_type":"artifact"', items[0]["after_json"])

        change_set_id = propose.json()["data"]["change_set"]["id"]
        apply_ok = client.post(
            f"/api/memory_change_sets/{change_set_id}/apply",
            headers={"X-Test-User": "u_editor"},
        )
        self.assertEqual(apply_ok.status_code, 200)

        with self.SessionLocal() as db:
            e = db.get(MemoryEntity, "ticket_midi")
            self.assertIsNotNone(e)
            self.assertEqual(e.entity_type, "artifact")

    def test_normalize_character_entity_duplicates_dry_run_and_apply(self) -> None:
        with self.SessionLocal() as db:
            db.add_all(
                [
                    MemoryEntity(
                        id="e_pan_character",
                        project_id="p1",
                        entity_type="character",
                        name="潘越",
                        summary_md=None,
                        attributes_json=None,
                    ),
                    MemoryEntity(
                        id="e_pan_person",
                        project_id="p1",
                        entity_type="person",
                        name="潘越",
                        summary_md=None,
                        attributes_json=None,
                    ),
                    MemoryEntity(
                        id="e_an",
                        project_id="p1",
                        entity_type="character",
                        name="阿南",
                        summary_md=None,
                        attributes_json=None,
                    ),
                    MemoryRelation(
                        id="r_pan_an",
                        project_id="p1",
                        from_entity_id="e_pan_person",
                        to_entity_id="e_an",
                        relation_type="ally",
                    ),
                    MemoryEvidence(
                        id="ev_pan",
                        project_id="p1",
                        source_type="entity",
                        source_id="e_pan_person",
                        quote_md="证据",
                    ),
                ]
            )
            db.commit()

            dry_run = normalize_character_entity_duplicates(db=db, project_id="p1", names=["潘越"], apply=False)
            self.assertEqual(dry_run["count"], 1)
            self.assertEqual(dry_run["plans"][0]["target_id"], "e_pan_character")
            self.assertIsNone(db.get(MemoryEntity, "e_pan_person").deleted_at)

            applied = normalize_character_entity_duplicates(db=db, project_id="p1", names=["潘越"], apply=True)
            self.assertEqual(applied["count"], 1)

            duplicate = db.get(MemoryEntity, "e_pan_person")
            self.assertIsNotNone(duplicate)
            self.assertIsNotNone(duplicate.deleted_at)
            relation = db.get(MemoryRelation, "r_pan_an")
            self.assertIsNotNone(relation)
            self.assertEqual(relation.from_entity_id, "e_pan_character")
            evidence = db.get(MemoryEvidence, "ev_pan")
            self.assertIsNotNone(evidence)
            self.assertEqual(evidence.source_id, "e_pan_character")
            settings = db.get(ProjectSettings, "p1")
            self.assertIsNotNone(settings)
            self.assertTrue(settings.vector_index_dirty)


if __name__ == "__main__":
    unittest.main()
