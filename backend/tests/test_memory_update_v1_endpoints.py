from __future__ import annotations

import json
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
from app.main import app_error_handler, validation_error_handler
from app.models.chapter import Chapter
from app.models.generation_run import GenerationRun
from app.models.outline import Outline
from app.models.project import Project
from app.models.project_membership import ProjectMembership
from app.models.structured_memory import (
    MemoryChangeSet,
    MemoryChangeSetItem,
    MemoryEntity,
    MemoryEvidence,
    MemoryEvent,
    MemoryForeshadow,
    MemoryRelation,
)
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
    app.include_router(memory_routes.router, prefix="/api")

    def _override_get_db() -> Generator[Session, None, None]:
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    return app


class TestMemoryUpdateV1Endpoints(unittest.TestCase):
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
                MemoryEvent.__table__,
                MemoryForeshadow.__table__,
                MemoryEvidence.__table__,
                MemoryChangeSet.__table__,
                MemoryChangeSetItem.__table__,
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
            db.add(Project(id="p1", owner_user_id="u_owner", name="Project 1", genre=None, logline=None))
            db.add(ProjectMembership(project_id="p1", user_id="u_editor", role="editor"))
            db.add(ProjectMembership(project_id="p1", user_id="u_viewer", role="viewer"))
            db.add(Outline(id="o1", project_id="p1", title="Outline", content_md=None, structure_json=None))
            db.add(Chapter(id="c1", project_id="p1", outline_id="o1", number=1, title="Ch1", status="done"))
            db.add(Project(id="p2", owner_user_id="u_owner", name="Project 2", genre=None, logline=None))
            db.add(Outline(id="o2", project_id="p2", title="Outline 2", content_md=None, structure_json=None))
            db.add(Chapter(id="c2", project_id="p2", outline_id="o2", number=1, title="Ch2", status="done"))
            db.commit()

    def test_validation_fail_closed(self) -> None:
        client = TestClient(self.app)
        resp = client.post(
            "/api/chapters/c1/memory/propose",
            headers={"X-Test-User": "u_editor"},
            json={"schema_version": "wrong", "idempotency_key": "key-12345678", "ops": []},
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["error"]["code"], "VALIDATION_ERROR")

    def test_viewer_cannot_propose(self) -> None:
        client = TestClient(self.app)
        resp = client.post(
            "/api/chapters/c1/memory/propose",
            headers={"X-Test-User": "u_viewer"},
            json={
                "schema_version": "memory_update_v1",
                "idempotency_key": "key-12345678",
                "ops": [
                    {
                        "op": "upsert",
                        "target_table": "entities",
                        "target_id": "e1",
                        "after": {"entity_type": "character", "name": "Alice"},
                    }
                ],
            },
        )
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()["error"]["code"], "FORBIDDEN")

    def test_propose_apply_and_rollback_soft_delete(self) -> None:
        client = TestClient(self.app)

        propose = client.post(
            "/api/chapters/c1/memory/propose",
            headers={"X-Test-User": "u_editor"},
            json={
                "schema_version": "memory_update_v1",
                "idempotency_key": "key-entity-upsert-1",
                "title": "upsert entity",
                "ops": [
                    {
                        "op": "upsert",
                        "target_table": "entities",
                        "target_id": "e1",
                        "after": {"entity_type": "character", "name": "Alice", "attributes": {"age": 18}},
                    }
                ],
            },
        )
        self.assertEqual(propose.status_code, 200)
        change_set_id = propose.json()["data"]["change_set"]["id"]

        apply1 = client.post(
            f"/api/memory_change_sets/{change_set_id}/apply",
            headers={"X-Test-User": "u_editor"},
        )
        self.assertEqual(apply1.status_code, 200)
        self.assertFalse(bool(apply1.json()["data"]["idempotent"]))

        apply2 = client.post(
            f"/api/memory_change_sets/{change_set_id}/apply",
            headers={"X-Test-User": "u_editor"},
        )
        self.assertEqual(apply2.status_code, 200)
        self.assertTrue(bool(apply2.json()["data"]["idempotent"]))

        with self.SessionLocal() as db:
            e1 = db.get(MemoryEntity, "e1")
            self.assertIsNotNone(e1)
            self.assertEqual(e1.project_id, "p1")
            self.assertEqual(e1.name, "Alice")
            self.assertIsNone(e1.deleted_at)

        propose_del = client.post(
            "/api/chapters/c1/memory/propose",
            headers={"X-Test-User": "u_editor"},
            json={
                "schema_version": "memory_update_v1",
                "idempotency_key": "key-entity-delete-1",
                "title": "delete entity",
                "ops": [
                    {
                        "op": "delete",
                        "target_table": "entities",
                        "target_id": "e1",
                    }
                ],
            },
        )
        self.assertEqual(propose_del.status_code, 200)
        del_change_set_id = propose_del.json()["data"]["change_set"]["id"]

        apply_del = client.post(
            f"/api/memory_change_sets/{del_change_set_id}/apply",
            headers={"X-Test-User": "u_editor"},
        )
        self.assertEqual(apply_del.status_code, 200)

        with self.SessionLocal() as db:
            e1 = db.get(MemoryEntity, "e1")
            self.assertIsNotNone(e1)
            self.assertIsNotNone(e1.deleted_at)

        rb = client.post(
            f"/api/memory_change_sets/{del_change_set_id}/rollback",
            headers={"X-Test-User": "u_editor"},
        )
        self.assertEqual(rb.status_code, 200)

        with self.SessionLocal() as db:
            e1 = db.get(MemoryEntity, "e1")
            self.assertIsNotNone(e1)
            self.assertIsNone(e1.deleted_at)

    def test_change_set_cannot_cross_project_apply(self) -> None:
        client = TestClient(self.app)
        propose = client.post(
            "/api/chapters/c2/memory/propose",
            headers={"X-Test-User": "u_owner"},
            json={
                "schema_version": "memory_update_v1",
                "idempotency_key": "key-cross-project-1",
                "ops": [
                    {
                        "op": "upsert",
                        "target_table": "entities",
                        "target_id": "p2_e1",
                        "after": {"entity_type": "character", "name": "Mallory"},
                    }
                ],
            },
        )
        self.assertEqual(propose.status_code, 200)
        change_set_id = propose.json()["data"]["change_set"]["id"]

        apply_forbidden = client.post(
            f"/api/memory_change_sets/{change_set_id}/apply",
            headers={"X-Test-User": "u_editor"},
        )
        self.assertEqual(apply_forbidden.status_code, 404)
        self.assertEqual(apply_forbidden.json()["error"]["code"], "NOT_FOUND")

    def test_change_set_cannot_cross_project_rollback(self) -> None:
        client = TestClient(self.app)
        propose = client.post(
            "/api/chapters/c2/memory/propose",
            headers={"X-Test-User": "u_owner"},
            json={
                "schema_version": "memory_update_v1",
                "idempotency_key": "key-cross-project-rb-1",
                "ops": [
                    {
                        "op": "upsert",
                        "target_table": "entities",
                        "target_id": "p2_e2",
                        "after": {"entity_type": "character", "name": "Carol"},
                    }
                ],
            },
        )
        self.assertEqual(propose.status_code, 200)
        change_set_id = propose.json()["data"]["change_set"]["id"]

        apply_ok = client.post(
            f"/api/memory_change_sets/{change_set_id}/apply",
            headers={"X-Test-User": "u_owner"},
        )
        self.assertEqual(apply_ok.status_code, 200)

        rollback_forbidden = client.post(
            f"/api/memory_change_sets/{change_set_id}/rollback",
            headers={"X-Test-User": "u_editor"},
        )
        self.assertEqual(rollback_forbidden.status_code, 404)
        self.assertEqual(rollback_forbidden.json()["error"]["code"], "NOT_FOUND")

    def test_propose_resolves_relation_entity_names_from_same_change_set(self) -> None:
        client = TestClient(self.app)
        propose = client.post(
            "/api/chapters/c1/memory/propose",
            headers={"X-Test-User": "u_editor"},
            json={
                "schema_version": "memory_update_v1",
                "idempotency_key": "key-relation-name-resolution-1",
                "ops": [
                    {
                        "op": "upsert",
                        "target_table": "entities",
                        "target_id": "e_alice",
                        "after": {"entity_type": "character", "name": "Alice"},
                    },
                    {
                        "op": "upsert",
                        "target_table": "entities",
                        "target_id": "e_bob",
                        "after": {"entity_type": "character", "name": "Bob"},
                    },
                    {
                        "op": "upsert",
                        "target_table": "relations",
                        "target_id": "r_alice_bob",
                        "after": {
                            "from_entity_id": "Alice",
                            "to_entity_id": "Bob",
                            "relation_type": "knows",
                        },
                    },
                ],
            },
        )
        self.assertEqual(propose.status_code, 200)
        relation_item = propose.json()["data"]["items"][2]
        self.assertEqual(relation_item["target_table"], "relations")
        self.assertIn('"from_entity_id":"e_alice"', relation_item["after_json"])
        self.assertIn('"to_entity_id":"e_bob"', relation_item["after_json"])

        change_set_id = propose.json()["data"]["change_set"]["id"]
        apply_ok = client.post(
            f"/api/memory_change_sets/{change_set_id}/apply",
            headers={"X-Test-User": "u_editor"},
        )
        self.assertEqual(apply_ok.status_code, 200)

        with self.SessionLocal() as db:
            relation = db.get(MemoryRelation, "r_alice_bob")
            self.assertIsNotNone(relation)
            self.assertEqual(relation.from_entity_id, "e_alice")
            self.assertEqual(relation.to_entity_id, "e_bob")

    def test_propose_normalizes_structured_memory_fields_before_saving_items(self) -> None:
        client = TestClient(self.app)
        propose = client.post(
            "/api/chapters/c1/memory/propose",
            headers={"X-Test-User": "u_editor"},
            json={
                "schema_version": "memory_update_v1",
                "idempotency_key": "key-normalize-fields-1",
                "ops": [
                    {
                        "op": "upsert",
                        "target_table": "entities",
                        "target_id": " e_alice ",
                        "after": {
                            "entity_type": " Person ",
                            "name": " Alice ",
                            "attributes": {" role ": " protagonist ", "": "drop"},
                        },
                        "evidence_ids": [" ev_1 "],
                    },
                    {
                        "op": "upsert",
                        "target_table": "entities",
                        "target_id": "e_bob",
                        "after": {"entity_type": "character", "name": "Bob"},
                    },
                    {
                        "op": "upsert",
                        "target_table": "relations",
                        "target_id": " r_alice_bob_norm ",
                        "after": {
                            "from_entity_id": " Alice ",
                            "to_entity_id": " Bob ",
                            "relation_type": " Close Friend ",
                        },
                    },
                    {
                        "op": "upsert",
                        "target_table": "events",
                        "target_id": " ev_norm ",
                        "after": {"event_type": " Plot Beat ", "content_md": "event"},
                    },
                    {
                        "op": "upsert",
                        "target_table": "evidence",
                        "target_id": " evidence_norm ",
                        "after": {"source_type": " Chapter ", "source_id": " c1 ", "quote_md": "quote"},
                    },
                    {
                        "op": "upsert",
                        "target_table": "foreshadows",
                        "target_id": " fs_norm ",
                        "after": {"content_md": "hook", "resolved": 1},
                    },
                ],
            },
        )

        self.assertEqual(propose.status_code, 200)
        items = propose.json()["data"]["items"]
        entity_after = json.loads(items[0]["after_json"])
        relation_after = json.loads(items[2]["after_json"])
        event_after = json.loads(items[3]["after_json"])
        evidence_after = json.loads(items[4]["after_json"])
        foreshadow_after = json.loads(items[5]["after_json"])

        self.assertEqual(items[0]["target_id"], "e_alice")
        self.assertEqual(items[0]["evidence_ids_json"], '["ev_1"]')
        self.assertEqual(entity_after["entity_type"], "character")
        self.assertEqual(entity_after["name"], "Alice")
        self.assertEqual(entity_after["attributes"], {"role": "protagonist"})
        self.assertEqual(relation_after["from_entity_id"], "e_alice")
        self.assertEqual(relation_after["to_entity_id"], "e_bob")
        self.assertEqual(relation_after["relation_type"], "close_friend")
        self.assertEqual(event_after["event_type"], "plot_beat")
        self.assertEqual(evidence_after["source_type"], "chapter")
        self.assertEqual(evidence_after["source_id"], "c1")
        self.assertEqual(foreshadow_after["resolved"], 1)

    def test_propose_marks_different_name_duplicate_entity_candidates_for_review(self) -> None:
        with self.SessionLocal() as db:
            db.add(
                MemoryEntity(
                    id="ticket_midi",
                    project_id="p1",
                    entity_type="artifact",
                    name="迷笛音乐节旧门票",
                    summary_md="一张泛黄的四年前迷笛音乐节门票，乐队名印在第三行，背面写着监听完毕，保留。",
                    attributes_json='{"event":"迷笛音乐节","note":"监听完毕，保留"}',
                )
            )
            db.commit()

        client = TestClient(self.app)
        propose = client.post(
            "/api/chapters/c1/memory/propose",
            headers={"X-Test-User": "u_editor"},
            json={
                "schema_version": "memory_update_v1",
                "idempotency_key": "key-duplicate-review-1",
                "ops": [
                    {
                        "op": "upsert",
                        "target_table": "entities",
                        "after": {
                            "entity_type": "object",
                            "name": "四年前迷笛音乐节门票",
                            "summary_md": "泛黄演出门票，日期为四年前迷笛音乐节，乐队名字在第三行，背面有监听完毕，保留。",
                        },
                    }
                ],
            },
        )

        self.assertEqual(propose.status_code, 200)
        item = propose.json()["data"]["items"][0]
        after = json.loads(item["after_json"])
        self.assertEqual(after["entity_type"], "artifact")
        review = after["attributes"]["__review"]
        self.assertTrue(review["duplicate_review_required"])
        self.assertEqual(review["duplicate_candidates"][0]["id"], "ticket_midi")
        self.assertIn("迷笛音乐节", review["duplicate_candidates"][0]["evidence"]["shared_terms"])

    def test_propose_rejects_unresolved_duplicate_review_marker_from_client(self) -> None:
        client = TestClient(self.app)
        propose = client.post(
            "/api/chapters/c1/memory/propose",
            headers={"X-Test-User": "u_editor"},
            json={
                "schema_version": "memory_update_v1",
                "idempotency_key": "key-duplicate-review-marker-1",
                "ops": [
                    {
                        "op": "upsert",
                        "target_table": "entities",
                        "after": {
                            "entity_type": "artifact",
                            "name": "四年前迷笛音乐节门票",
                            "attributes": {"__review": {"duplicate_review_required": True}},
                        },
                    }
                ],
            },
        )

        self.assertEqual(propose.status_code, 400)
        body = propose.json()
        self.assertEqual(body["error"]["code"], "VALIDATION_ERROR")
        self.assertEqual(body["error"]["details"]["reason"], "duplicate_review_unresolved")

    def test_propose_rejects_relation_with_unresolved_entity_ref(self) -> None:
        client = TestClient(self.app)
        propose = client.post(
            "/api/chapters/c1/memory/propose",
            headers={"X-Test-User": "u_editor"},
            json={
                "schema_version": "memory_update_v1",
                "idempotency_key": "key-unresolved-relation-ref-1",
                "ops": [
                    {
                        "op": "upsert",
                        "target_table": "entities",
                        "target_id": "e_yuriko",
                        "after": {"entity_type": "character", "name": "百合子"},
                    },
                    {
                        "op": "upsert",
                        "target_table": "entities",
                        "target_id": "e_pan_yue",
                        "after": {"entity_type": "character", "name": "潘越"},
                    },
                    {
                        "op": "upsert",
                        "target_table": "relations",
                        "target_id": "r_yuriko_pan",
                        "after": {
                            "from_entity_id": "yuriko",
                            "to_entity_id": "潘越",
                            "relation_type": "knows",
                        },
                    },
                ],
            },
        )

        self.assertEqual(propose.status_code, 400)
        body = propose.json()
        self.assertEqual(body["error"]["code"], "VALIDATION_ERROR")
        self.assertEqual(body["error"]["details"]["reason"], "unresolved_relation_entity_ref")
        self.assertEqual(body["error"]["details"]["ref"], "yuriko")

        with self.SessionLocal() as db:
            change_sets = db.query(MemoryChangeSet).all()
            self.assertEqual(change_sets, [])
            self.assertIsNone(db.get(MemoryEntity, "e_yuriko"))
            self.assertIsNone(db.get(MemoryEntity, "e_pan_yue"))

    def test_propose_rejects_items_bound_to_another_chapter(self) -> None:
        with self.SessionLocal() as db:
            db.add(Chapter(id="c1_second", project_id="p1", outline_id="o1", number=2, title="Ch2", status="done"))
            db.commit()

        client = TestClient(self.app)
        propose = client.post(
            "/api/chapters/c1_second/memory/propose",
            headers={"X-Test-User": "u_editor"},
            json={
                "schema_version": "memory_update_v1",
                "idempotency_key": "key-cross-chapter-memory-1",
                "ops": [
                    {
                        "op": "upsert",
                        "target_table": "events",
                        "target_id": "ev_from_c1",
                        "after": {
                            "chapter_id": "c1",
                            "event_type": "scene",
                            "title": "Wrong chapter event",
                            "content_md": "This event belongs to chapter 1.",
                        },
                    },
                    {
                        "op": "upsert",
                        "target_table": "evidence",
                        "target_id": "evidence_from_c1",
                        "after": {
                            "source_type": "chapter",
                            "source_id": "c1",
                            "quote_md": "Chapter 1 quote.",
                        },
                    },
                ],
            },
        )

        self.assertEqual(propose.status_code, 400)
        body = propose.json()
        self.assertEqual(body["error"]["code"], "VALIDATION_ERROR")
        self.assertEqual(body["error"]["details"]["reason"], "memory_update_item_chapter_mismatch")
        self.assertEqual(body["error"]["details"]["expected_chapter_id"], "c1_second")

        with self.SessionLocal() as db:
            change_sets = db.query(MemoryChangeSet).all()
            self.assertEqual(change_sets, [])
            self.assertIsNone(db.get(MemoryEvent, "ev_from_c1"))
            self.assertIsNone(db.get(MemoryEvidence, "evidence_from_c1"))

    def test_propose_rejects_chapter_evidence_bound_to_another_chapter(self) -> None:
        with self.SessionLocal() as db:
            db.add(Chapter(id="c1_second", project_id="p1", outline_id="o1", number=2, title="Ch2", status="done"))
            db.commit()

        client = TestClient(self.app)
        propose = client.post(
            "/api/chapters/c1_second/memory/propose",
            headers={"X-Test-User": "u_editor"},
            json={
                "schema_version": "memory_update_v1",
                "idempotency_key": "key-cross-chapter-evidence-1",
                "ops": [
                    {
                        "op": "upsert",
                        "target_table": "evidence",
                        "target_id": "evidence_from_c1",
                        "after": {
                            "source_type": "chapter",
                            "source_id": "c1",
                            "quote_md": "Chapter 1 quote.",
                        },
                    },
                ],
            },
        )

        self.assertEqual(propose.status_code, 400)
        body = propose.json()
        self.assertEqual(body["error"]["code"], "VALIDATION_ERROR")
        self.assertEqual(body["error"]["details"]["reason"], "memory_update_item_chapter_mismatch")
        self.assertEqual(body["error"]["details"]["target_table"], "evidence")
        self.assertEqual(body["error"]["details"]["field"], "source_id")

        with self.SessionLocal() as db:
            self.assertEqual(db.query(MemoryChangeSet).all(), [])
            self.assertIsNone(db.get(MemoryEvidence, "evidence_from_c1"))

    def test_propose_rejects_foreshadow_bound_to_another_chapter(self) -> None:
        with self.SessionLocal() as db:
            db.add(Chapter(id="c1_second", project_id="p1", outline_id="o1", number=2, title="Ch2", status="done"))
            db.commit()

        client = TestClient(self.app)
        propose = client.post(
            "/api/chapters/c1_second/memory/propose",
            headers={"X-Test-User": "u_editor"},
            json={
                "schema_version": "memory_update_v1",
                "idempotency_key": "key-cross-chapter-foreshadow-1",
                "ops": [
                    {
                        "op": "upsert",
                        "target_table": "foreshadows",
                        "target_id": "fo_from_c1",
                        "after": {
                            "chapter_id": "c1",
                            "title": "Wrong chapter foreshadow",
                            "content_md": "This foreshadow belongs to chapter 1.",
                            "resolved": 0,
                        },
                    },
                ],
            },
        )

        self.assertEqual(propose.status_code, 400)
        body = propose.json()
        self.assertEqual(body["error"]["code"], "VALIDATION_ERROR")
        self.assertEqual(body["error"]["details"]["reason"], "memory_update_item_chapter_mismatch")
        self.assertEqual(body["error"]["details"]["target_table"], "foreshadows")
        self.assertEqual(body["error"]["details"]["field"], "chapter_id")

        with self.SessionLocal() as db:
            self.assertEqual(db.query(MemoryChangeSet).all(), [])
            self.assertIsNone(db.get(MemoryForeshadow, "fo_from_c1"))

    def test_propose_allows_items_bound_to_target_chapter(self) -> None:
        client = TestClient(self.app)
        propose = client.post(
            "/api/chapters/c1/memory/propose",
            headers={"X-Test-User": "u_editor"},
            json={
                "schema_version": "memory_update_v1",
                "idempotency_key": "key-target-chapter-memory-1",
                "ops": [
                    {
                        "op": "upsert",
                        "target_table": "events",
                        "target_id": "ev_from_c1",
                        "after": {
                            "chapter_id": "c1",
                            "event_type": "scene",
                            "title": "Target chapter event",
                            "content_md": "This event belongs to chapter 1.",
                        },
                    },
                    {
                        "op": "upsert",
                        "target_table": "evidence",
                        "target_id": "evidence_from_c1",
                        "after": {
                            "source_type": "chapter",
                            "source_id": "c1",
                            "quote_md": "Chapter 1 quote.",
                        },
                    },
                ],
            },
        )

        self.assertEqual(propose.status_code, 200)
        data = propose.json()["data"]
        self.assertEqual(data["change_set"]["status"], "proposed")
        self.assertEqual(len(data["items"]), 2)

    def test_apply_integrity_error_marks_failed(self) -> None:
        with self.SessionLocal() as db:
            db.add(
                MemoryEntity(
                    id="e_existing",
                    project_id="p1",
                    entity_type="character",
                    name="Alice",
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
                "idempotency_key": "key-integrity-error-1",
                "ops": [
                    {
                        "op": "upsert",
                        "target_table": "entities",
                        "target_id": "e_conflict",
                        "after": {"entity_type": "character", "name": "Alice"},
                    }
                ],
            },
        )
        self.assertEqual(propose.status_code, 200)
        change_set_id = propose.json()["data"]["change_set"]["id"]

        apply_conflict = client.post(
            f"/api/memory_change_sets/{change_set_id}/apply",
            headers={"X-Test-User": "u_editor"},
        )
        self.assertEqual(apply_conflict.status_code, 409)
        self.assertEqual(apply_conflict.json()["error"]["code"], "CONFLICT")
        self.assertEqual(apply_conflict.json()["error"]["details"]["reason"], "integrity_error")

        with self.SessionLocal() as db:
            change_set = db.get(MemoryChangeSet, change_set_id)
            self.assertIsNotNone(change_set)
            self.assertEqual(change_set.status, "failed")

            conflict_row = db.get(MemoryEntity, "e_conflict")
            self.assertIsNone(conflict_row)


if __name__ == "__main__":
    unittest.main()
