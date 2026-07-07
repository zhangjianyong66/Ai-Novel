from __future__ import annotations

import json
import unittest

from datetime import datetime, timezone

from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.chapter import Chapter
from app.models.chapter_version import ChapterVersion
from app.models.character import Character
from app.models.fractal_memory import FractalMemory
from app.models.glossary_term import GlossaryTerm
from app.models.knowledge_base import KnowledgeBase
from app.models.llm_profile import LLMProfile
from app.models.llm_preset import LLMPreset
from app.models.llm_task_preset import LLMTaskPreset
from app.models.outline import Outline
from app.models.plot_analysis import PlotAnalysis
from app.models.project import Project
from app.models.project_default_style import ProjectDefaultStyle
from app.models.project_membership import ProjectMembership
from app.models.project_settings import ProjectSettings
from app.models.project_source_document import ProjectSourceDocument
from app.models.project_table import ProjectTable, ProjectTableRow
from app.models.prompt_block import PromptBlock
from app.models.prompt_preset import PromptPreset
from app.models.story_memory import StoryMemory
from app.models.structured_memory import MemoryEntity, MemoryEvent, MemoryEvidence, MemoryForeshadow, MemoryRelation
from app.models.user import User
from app.models.writing_style import WritingStyle
from app.models.worldbook_entry import WorldBookEntry
from app.services.import_export_service import export_project_bundle, import_project_bundle
from app.services.prompt_presets import ensure_default_chapter_preset, ensure_default_outline_preset
from app.services.vector_kb_service import ensure_default_kb


class TestProjectBundleRoundtrip(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        event.listen(engine, "connect", lambda dbapi_connection, _connection_record: dbapi_connection.execute("PRAGMA foreign_keys=ON"))
        self.addCleanup(engine.dispose)

        Base.metadata.create_all(
            engine,
            tables=[
                User.__table__,
                Project.__table__,
                ProjectMembership.__table__,
                ProjectSettings.__table__,
                LLMProfile.__table__,
                LLMPreset.__table__,
                LLMTaskPreset.__table__,
                Outline.__table__,
                ChapterVersion.__table__,
                Chapter.__table__,
                Character.__table__,
                WorldBookEntry.__table__,
                PromptPreset.__table__,
                PromptBlock.__table__,
                MemoryEntity.__table__,
                MemoryRelation.__table__,
                MemoryEvent.__table__,
                MemoryForeshadow.__table__,
                MemoryEvidence.__table__,
                StoryMemory.__table__,
                KnowledgeBase.__table__,
                ProjectSourceDocument.__table__,
                ProjectTable.__table__,
                ProjectTableRow.__table__,
                GlossaryTerm.__table__,
                WritingStyle.__table__,
                ProjectDefaultStyle.__table__,
                FractalMemory.__table__,
                PlotAnalysis.__table__,
            ],
        )

        self.SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def test_export_then_import_creates_new_project(self) -> None:
        with self.SessionLocal() as db:
            _seed_project(db)

            bundle = export_project_bundle(db, project_id="p1")
            self.assertEqual(bundle.get("schema_version"), "project_bundle_v1")

            # Security redline: do not export ciphertext.
            settings = bundle.get("settings") or {}
            vec = settings.get("vector_embedding") or {}
            self.assertIn("has_api_key", vec)
            self.assertIn("masked_api_key", vec)
            self.assertNotIn("vector_embedding_api_key_ciphertext", str(bundle))
            self.assertNotIn("vector_rerank_api_key_ciphertext", str(bundle))
            self.assertNotIn("fractal_memory", bundle)
            self.assertNotIn("plot_analysis", bundle)
            self.assertEqual(len((bundle.get("chapter_versions") or {}).get("versions") or []), 2)
            self.assertEqual((bundle.get("chapters") or [{}])[0].get("active_version_id"), "cv2")
            exported_story_memories = (bundle.get("story_memory") or {}).get("memories") or []
            self.assertTrue(any(m.get("scope") == "outline" and m.get("outline_id") == "o1" for m in exported_story_memories))

            imported = import_project_bundle(db, owner_user_id="u1", bundle=bundle, rebuild_vectors=False)
            self.assertTrue(imported.get("ok"))
            new_project_id = imported.get("project_id")
            self.assertTrue(isinstance(new_project_id, str))
            self.assertNotEqual(new_project_id, "p1")

            new_project = db.get(Project, new_project_id)
            self.assertIsNotNone(new_project)
            self.assertEqual(new_project.name, "Project 1")

            # Ensure key data types roundtrip.
            self.assertEqual(_count(db, select(Outline).where(Outline.project_id == new_project_id)), 1)
            self.assertEqual(_count(db, select(Chapter).where(Chapter.project_id == new_project_id)), 1)
            self.assertEqual(_count(db, select(Character).where(Character.project_id == new_project_id)), 1)
            self.assertEqual(_count(db, select(WorldBookEntry).where(WorldBookEntry.project_id == new_project_id)), 1)
            self.assertEqual(_count(db, select(ProjectSourceDocument).where(ProjectSourceDocument.project_id == new_project_id)), 1)
            self.assertEqual(_count(db, select(MemoryEntity).where(MemoryEntity.project_id == new_project_id)), 2)
            self.assertEqual(_count(db, select(MemoryRelation).where(MemoryRelation.project_id == new_project_id)), 1)
            self.assertEqual(_count(db, select(MemoryEvent).where(MemoryEvent.project_id == new_project_id)), 1)
            self.assertEqual(_count(db, select(MemoryForeshadow).where(MemoryForeshadow.project_id == new_project_id)), 1)
            self.assertEqual(_count(db, select(MemoryEvidence).where(MemoryEvidence.project_id == new_project_id)), 1)
            self.assertEqual(_count(db, select(StoryMemory).where(StoryMemory.project_id == new_project_id)), 2)
            self.assertEqual(_count(db, select(ChapterVersion).where(ChapterVersion.project_id == new_project_id)), 2)
            self.assertGreaterEqual(_count(db, select(KnowledgeBase).where(KnowledgeBase.project_id == new_project_id)), 1)
            self.assertEqual(_count(db, select(LLMTaskPreset).where(LLMTaskPreset.project_id == new_project_id)), 1)
            self.assertEqual(_count(db, select(ProjectTable).where(ProjectTable.project_id == new_project_id)), 1)
            self.assertEqual(_count(db, select(ProjectTableRow).where(ProjectTableRow.project_id == new_project_id)), 1)
            self.assertEqual(_count(db, select(GlossaryTerm).where(GlossaryTerm.project_id == new_project_id)), 1)
            self.assertEqual(_count(db, select(ProjectDefaultStyle).where(ProjectDefaultStyle.project_id == new_project_id)), 1)
            self.assertEqual(_count(db, select(FractalMemory).where(FractalMemory.project_id == new_project_id)), 0)
            self.assertEqual(_count(db, select(PlotAnalysis).where(PlotAnalysis.project_id == new_project_id)), 0)

            new_settings = db.get(ProjectSettings, new_project_id)
            self.assertIsNotNone(new_settings)
            self.assertIsNone(new_settings.vector_embedding_api_key_ciphertext)
            self.assertIsNone(new_settings.vector_rerank_api_key_ciphertext)
            self.assertEqual(new_settings.vector_rerank_provider, "openai_compatible")
            self.assertEqual(new_settings.vector_rerank_model, "bge-reranker")
            self.assertFalse(new_settings.auto_update_graph_enabled)
            self.assertFalse(new_settings.auto_update_tables_enabled)

            task_preset = db.get(LLMTaskPreset, (new_project_id, "chapter_generate"))
            self.assertIsNotNone(task_preset)
            self.assertIsNone(task_preset.llm_profile_id)
            self.assertEqual(task_preset.model, "gpt-4o-mini")

            imported_default = db.get(ProjectDefaultStyle, new_project_id)
            self.assertIsNotNone(imported_default)
            self.assertIsNotNone(imported_default.style_id)
            imported_style = db.get(WritingStyle, imported_default.style_id)
            self.assertIsNotNone(imported_style)
            self.assertEqual(imported_style.owner_user_id, "u1")
            self.assertFalse(imported_style.is_preset)
            self.assertEqual(imported_style.name, "Style 1")

            imported_chapter = db.execute(select(Chapter).where(Chapter.project_id == new_project_id)).scalar_one()
            imported_versions = (
                db.execute(select(ChapterVersion).where(ChapterVersion.project_id == new_project_id).order_by(ChapterVersion.created_at.asc()))
                .scalars()
                .all()
            )
            self.assertEqual([v.content_md for v in imported_versions], ["draft v1", "draft v2"])
            self.assertEqual([v.source for v in imported_versions], ["manual_snapshot", "ai_generate"])
            self.assertEqual(imported_versions[1].provider, "openai")
            self.assertEqual(imported_versions[1].model, "gpt-4o-mini")
            self.assertEqual(imported_versions[1].meta_json, '{"run":"meta"}')
            self.assertEqual(imported_chapter.active_version_id, imported_versions[1].id)

            imported_outline_id = imported_chapter.outline_id
            imported_memories = (
                db.execute(select(StoryMemory).where(StoryMemory.project_id == new_project_id).order_by(StoryMemory.title.asc()))
                .scalars()
                .all()
            )
            memories_by_title = {m.title: m for m in imported_memories}
            outline_memory = memories_by_title["outline memory"]
            self.assertEqual(outline_memory.scope, "outline")
            self.assertEqual(outline_memory.outline_id, imported_outline_id)
            self.assertEqual(outline_memory.chapter_id, imported_chapter.id)
            self.assertEqual(outline_memory.memory_type, "next_requirement")
            self.assertEqual(json.loads(str(outline_memory.metadata_json or "{}")).get("target_chapter_number"), 2)
            project_memory = memories_by_title["project memory"]
            self.assertEqual(project_memory.scope, "project")
            self.assertIsNone(project_memory.outline_id)
            self.assertIsNone(project_memory.chapter_id)

    def test_import_legacy_bundle_without_versions_or_story_memory_scope(self) -> None:
        with self.SessionLocal() as db:
            _seed_project(db)

            bundle = export_project_bundle(db, project_id="p1")
            bundle.pop("chapter_versions", None)
            for chapter in bundle.get("chapters") or []:
                chapter.pop("active_version_id", None)
            for memory in (bundle.get("story_memory") or {}).get("memories") or []:
                memory.pop("scope", None)
                memory.pop("outline_id", None)

            imported = import_project_bundle(db, owner_user_id="u1", bundle=bundle, rebuild_vectors=False)
            self.assertTrue(imported.get("ok"))
            new_project_id = imported.get("project_id")
            self.assertTrue(isinstance(new_project_id, str))

            imported_chapter = db.execute(select(Chapter).where(Chapter.project_id == new_project_id)).scalar_one()
            self.assertIsNone(imported_chapter.active_version_id)
            self.assertEqual(_count(db, select(ChapterVersion).where(ChapterVersion.project_id == new_project_id)), 0)

            imported_memories = db.execute(select(StoryMemory).where(StoryMemory.project_id == new_project_id)).scalars().all()
            self.assertEqual(len(imported_memories), 2)
            self.assertTrue(all(m.scope == "unassigned" for m in imported_memories))
            self.assertTrue(all(m.outline_id is None for m in imported_memories))


def _count(db: Session, stmt) -> int:  # type: ignore[no-untyped-def]
    return int(len(db.execute(stmt).scalars().all()))


def _seed_project(db: Session) -> None:
    db.add(User(id="u1", display_name="User 1", is_admin=False))
    db.flush()
    project = Project(
        id="p1",
        owner_user_id="u1",
        name="Project 1",
        genre="fantasy",
        logline="x",
        active_outline_id=None,
        llm_profile_id=None,
    )
    db.add(project)
    db.add(ProjectMembership(project_id="p1", user_id="u1", role="owner"))
    db.flush()
    db.add(
        ProjectSettings(
            project_id="p1",
            world_setting="world",
            style_guide="style",
            constraints="constraints",
            vector_embedding_provider="openai",
            vector_embedding_model="text-embedding-3-small",
            vector_embedding_api_key_ciphertext="enc:dummy",
            vector_embedding_api_key_masked="sk****1234",
            vector_rerank_enabled=True,
            vector_rerank_method="external",
            vector_rerank_top_k=12,
            vector_rerank_provider="openai_compatible",
            vector_rerank_base_url="https://rerank.example.com/v1",
            vector_rerank_model="bge-reranker",
            vector_rerank_api_key_ciphertext="enc:rerank",
            vector_rerank_api_key_masked="rk****5678",
            vector_rerank_timeout_seconds=18,
            vector_rerank_hybrid_alpha=0.7,
            query_preprocessing_json='{"enabled":true}',
            context_optimizer_enabled=True,
            auto_update_graph_enabled=False,
            auto_update_tables_enabled=False,
        )
    )
    db.add(LLMPreset(project_id="p1", provider="openai", base_url=None, model="gpt-4o-mini", temperature=0.2))
    db.add(
        LLMTaskPreset(
            project_id="p1",
            task_key="chapter_generate",
            llm_profile_id=None,
            provider="openai",
            base_url=None,
            model="gpt-4o-mini",
            temperature=0.3,
            top_p=0.9,
            max_tokens=1200,
            presence_penalty=0.1,
            frequency_penalty=0.2,
            top_k=None,
            stop_json='["END"]',
            timeout_seconds=60,
            extra_json='{"reasoning":false}',
        )
    )

    outline = Outline(id="o1", project_id="p1", title="Outline 1", content_md="outline", structure_json=None)
    db.add(outline)
    db.flush()
    chapter = Chapter(id="c1", project_id="p1", outline_id="o1", number=1, title="Chapter 1", plan="p", content_md="c", summary="s", status="done")
    db.add(chapter)
    db.flush()
    db.add_all(
        [
            ChapterVersion(
                id="cv1",
                project_id="p1",
                chapter_id="c1",
                source="manual_snapshot",
                content_md="draft v1",
                word_count=2,
                created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            ),
            ChapterVersion(
                id="cv2",
                project_id="p1",
                chapter_id="c1",
                source="ai_generate",
                content_md="draft v2",
                word_count=2,
                generation_run_id="run-old",
                provider="openai",
                model="gpt-4o-mini",
                meta_json='{"run":"meta"}',
                created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
            ),
        ]
    )
    db.flush()
    chapter.active_version_id = "cv2"
    project.active_outline_id = "o1"

    db.add(Character(id="char1", project_id="p1", name="Alice", role="hero", profile="p", notes=None))
    db.add(WorldBookEntry(id="w1", project_id="p1", title="WB", content_md="wb", enabled=True, constant=False, keywords_json="[]"))

    e1 = MemoryEntity(id="e1", project_id="p1", entity_type="person", name="Alice", summary_md="a", attributes_json=None, deleted_at=None)
    e2 = MemoryEntity(id="e2", project_id="p1", entity_type="person", name="Bob", summary_md="b", attributes_json=None, deleted_at=None)
    db.add_all([e1, e2])
    db.add(
        MemoryRelation(
            id="r1",
            project_id="p1",
            from_entity_id="e1",
            to_entity_id="e2",
            relation_type="knows",
            description_md="d",
            attributes_json=None,
            deleted_at=None,
        )
    )
    db.add(MemoryEvent(id="ev1", project_id="p1", chapter_id="c1", event_type="event", title="t", content_md="m", attributes_json=None, deleted_at=None))
    db.add(
        MemoryForeshadow(
            id="f1",
            project_id="p1",
            chapter_id="c1",
            resolved_at_chapter_id=None,
            title="f",
            content_md="f",
            resolved=0,
            attributes_json=None,
            deleted_at=None,
        )
    )
    db.add(MemoryEvidence(id="x1", project_id="p1", source_type="chapter", source_id="c1", quote_md="q", attributes_json=None, deleted_at=None))
    db.add(
        StoryMemory(
            id="sm1",
            project_id="p1",
            chapter_id="c1",
            outline_id="o1",
            scope="outline",
            memory_type="next_requirement",
            title="outline memory",
            content="c",
            full_context_md=None,
            importance_score=0.5,
            tags_json=None,
            story_timeline=0,
            text_position=-1,
            text_length=0,
            is_foreshadow=0,
            foreshadow_resolved_at_chapter_id=None,
            metadata_json=json.dumps(
                {
                    "source": "chapter_analysis.followup_assets",
                    "asset_type": "next_chapter_requirement",
                    "target_chapter_number": 2,
                    "lifecycle": "next_chapter_only",
                },
                ensure_ascii=False,
            ),
        )
    )
    db.add(
        StoryMemory(
            id="sm2",
            project_id="p1",
            chapter_id=None,
            outline_id=None,
            scope="project",
            memory_type="note",
            title="project memory",
            content="project scope",
            full_context_md=None,
            importance_score=0.4,
            tags_json=None,
            story_timeline=0,
            text_position=-1,
            text_length=0,
            is_foreshadow=0,
            foreshadow_resolved_at_chapter_id=None,
            metadata_json=None,
        )
    )
    db.add(
        ProjectSourceDocument(
            id="d1",
            project_id="p1",
            actor_user_id="u1",
            filename="doc.txt",
            content_type="txt",
            content_text="hello",
            status="done",
            progress=100,
            progress_message="done",
            chunk_count=0,
            kb_id="default",
            vector_ingest_result_json=None,
            worldbook_proposal_json=None,
            story_memory_proposal_json=None,
            error_message=None,
        )
    )
    db.add(
        ProjectTable(
            id="t1",
            project_id="p1",
            table_key="power",
            name="Power",
            auto_update_enabled=False,
            schema_version=1,
            schema_json='{"columns":[{"key":"name","type":"text"}]}',
        )
    )
    db.add(ProjectTableRow(id="tr1", project_id="p1", table_id="t1", row_index=0, data_json='{"name":"Alice"}'))
    db.add(GlossaryTerm(id="g1", project_id="p1", term="灵能", aliases_json='["psi"]', sources_json='["manual"]', origin="manual", enabled=1))
    db.add(
        WritingStyle(
            id="ws1",
            owner_user_id="u1",
            name="Style 1",
            description="desc",
            prompt_content="write like this",
            is_preset=False,
        )
    )
    db.flush()
    db.add(ProjectDefaultStyle(project_id="p1", style_id="ws1"))
    db.add(FractalMemory(id="fm1", project_id="p1", config_json="{}", scenes_json="[]", arcs_json="[]", sagas_json="[]"))
    db.add(
        PlotAnalysis(
            id="pa1",
            project_id="p1",
            chapter_id="c1",
            analysis_json="{}",
            overall_quality_score=0.9,
            coherence_score=0.8,
            engagement_score=0.7,
            pacing_score=0.6,
            analysis_report_md="analysis",
        )
    )
    db.commit()

    ensure_default_outline_preset(db, project_id="p1", activate=True)
    ensure_default_chapter_preset(db, project_id="p1", activate=True)
    ensure_default_kb(db, project_id="p1")


if __name__ == "__main__":
    unittest.main()
