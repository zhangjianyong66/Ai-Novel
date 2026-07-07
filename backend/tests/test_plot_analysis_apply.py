from __future__ import annotations

import unittest
from types import SimpleNamespace

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.errors import AppError
from app.models.generation_run import GenerationRun
from app.models.plot_analysis import PlotAnalysis
from app.models.project_settings import ProjectSettings
from app.models.story_memory import StoryMemory
from app.services.plot_analysis_service import (
    apply_chapter_analysis,
    compute_analysis_hash,
    extract_story_memory_seeds,
    get_latest_plot_analysis_snapshot,
    save_plot_analysis_snapshot,
    validate_analysis_payload,
)


class TestPlotAnalysisApply(unittest.TestCase):
    def _make_db(self):
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        self.addCleanup(engine.dispose)
        with engine.begin() as conn:
            conn.exec_driver_sql("PRAGMA foreign_keys=ON;")
            conn.exec_driver_sql("CREATE TABLE users (id VARCHAR(64) PRIMARY KEY)")
            conn.exec_driver_sql("CREATE TABLE projects (id VARCHAR(36) PRIMARY KEY)")
            conn.exec_driver_sql("CREATE TABLE outlines (id VARCHAR(36) PRIMARY KEY, project_id VARCHAR(36))")
            conn.exec_driver_sql(
                "CREATE TABLE chapters ("
                "id VARCHAR(36) PRIMARY KEY, project_id VARCHAR(36), outline_id VARCHAR(36), "
                "content_md TEXT, active_version_id VARCHAR(36)"
                ")"
            )
            conn.execute(text("INSERT INTO users (id) VALUES (:id)"), {"id": "local-user"})
            conn.execute(text("INSERT INTO projects (id) VALUES (:id)"), {"id": "project-1"})
            conn.execute(text("INSERT INTO outlines (id, project_id) VALUES (:id, :project_id)"), {"id": "outline-1", "project_id": "project-1"})
            conn.execute(
                text("INSERT INTO chapters (id, project_id, outline_id) VALUES (:id, :project_id, :outline_id)"),
                {"id": "chapter-1", "project_id": "project-1", "outline_id": "outline-1"},
            )

        GenerationRun.__table__.create(engine)
        PlotAnalysis.__table__.create(engine)
        ProjectSettings.__table__.create(engine)
        StoryMemory.__table__.create(engine)
        return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def test_validate_analysis_payload_rejects_non_object(self) -> None:
        with self.assertRaises(AppError) as ctx:
            validate_analysis_payload(["not-a-dict"])  # type: ignore[arg-type]
        self.assertEqual(ctx.exception.code, "ANALYSIS_PARSE_ERROR")

    def test_validate_analysis_payload_rejects_unknown_fields(self) -> None:
        with self.assertRaises(AppError) as ctx:
            validate_analysis_payload({"chapter_summary": "ok", "unknown_field": 1})
        self.assertEqual(ctx.exception.code, "ANALYSIS_SCHEMA_ERROR")

    def test_validate_analysis_payload_accepts_finalization_fields(self) -> None:
        out = validate_analysis_payload(
            {
                "schema_version": 1,
                "chapter_summary": "本章完成线索交付。",
                "finalization": {
                    "verdict": "ready",
                    "reason": "没有阻断定稿问题。",
                    "recommended_action": "可定稿并推进下一章。",
                },
                "outline_goal": {"status": "complete", "notes": "大纲目标已完成。"},
                "blocking_issues": [
                    {
                        "title": "关键因果缺口",
                        "excerpt": "他忽然决定离开",
                        "issue": "缺少行动理由",
                        "recommendation": "补足选择离开的直接触发。",
                        "severity": "critical",
                    }
                ],
                "optional_improvements": [],
                "polish_suggestions": [],
                "followup_assets": [{"type": "fact", "title": "主角已知道线索 A", "note": "下一章可承接。"}],
                "previous_issue_tracking": [{"issue": "人物动机不足", "status": "resolved", "note": "已补足。"}],
                "planning_notes": ["后续章节建议不能阻止当前章节定稿。"],
            }
        )

        self.assertEqual(out["finalization"]["verdict"], "ready")
        self.assertEqual(out["outline_goal"]["status"], "complete")
        self.assertEqual(len(out["blocking_issues"]), 1)

    def test_validate_analysis_payload_rejects_unknown_nested_fields(self) -> None:
        with self.assertRaises(AppError) as ctx:
            validate_analysis_payload({"hooks": [{"excerpt": "a", "note": "b", "extra": "x"}]})
        self.assertEqual(ctx.exception.code, "ANALYSIS_SCHEMA_ERROR")
        self.assertIn("unknown_fields", ctx.exception.details)

    def test_canonicalization_is_stable_for_key_order(self) -> None:
        a = {"chapter_summary": "sum", "overall_notes": "ok", "hooks": [{"excerpt": "E", "note": "N"}]}
        b = {"overall_notes": "ok", "hooks": [{"note": "N", "excerpt": "E"}], "chapter_summary": "sum"}
        _, h1 = compute_analysis_hash(validate_analysis_payload(a))
        _, h2 = compute_analysis_hash(validate_analysis_payload(b))
        self.assertEqual(h1, h2)

    def test_extract_story_memory_seeds_always_has_chapter_summary(self) -> None:
        seeds = extract_story_memory_seeds(
            chapter_number=3,
            analysis={
                "chapter_summary": "",
                "plot_points": [{"beat": "转折 A", "excerpt": ""}, {"beat": "冲突升级", "excerpt": ""}],
                "hooks": [{"excerpt": "不存在的片段", "note": "钩子说明"}],
            },
            content_md="正文里没有那个片段。",
        )
        self.assertGreaterEqual(len(seeds), 1)
        self.assertEqual(seeds[0]["memory_type"], "chapter_summary")
        self.assertIn("转折 A", str(seeds[0]["content"]))
        hook = next((s for s in seeds if s["memory_type"] == "hook"), None)
        self.assertIsNotNone(hook)
        self.assertEqual(hook["text_position"], -1)
        self.assertEqual(hook["text_length"], 0)

    def test_extract_story_memory_seeds_filters_worldbook_style_plot_points(self) -> None:
        seeds = extract_story_memory_seeds(
            chapter_number=1,
            analysis={
                "chapter_summary": "摘要",
                "plot_points": [
                    {"beat": "地点：青云峰（描述：……）", "excerpt": ""},
                    {"beat": "主角抵达青云峰并发现异常线索", "excerpt": ""},
                ],
            },
            content_md="主角抵达青云峰并发现异常线索。",
        )
        plot_points = [s for s in seeds if s.get("memory_type") == "plot_point"]
        self.assertEqual(len(plot_points), 1)
        self.assertIn("主角抵达青云峰", str(plot_points[0].get("content") or ""))

    def test_extract_story_memory_seeds_maps_injectable_followup_assets(self) -> None:
        seeds = extract_story_memory_seeds(
            chapter_number=11,
            analysis={
                "chapter_summary": "摘要",
                "followup_assets": [
                    {"type": "continuity_fact", "title": "线索归属", "note": "钥匙已经交给林澈。"},
                    {"type": "next_chapter_requirement", "title": "下一章承接", "note": "下一章必须让林澈使用钥匙。"},
                    {"type": "future_payoff", "title": "旧钟声", "note": "旧钟声将在后续揭示真实来源。"},
                    {"type": "optional_idea", "title": "可选桥段", "note": "可以增加雨夜气氛。"},
                    {"type": "legacy free text", "title": "旧格式", "note": "不应自动注入。"},
                ],
            },
            content_md="正文",
        )

        by_type = {}
        for seed in seeds:
            by_type.setdefault(seed.get("memory_type"), []).append(seed)

        continuity = by_type["continuity_fact"][0]
        self.assertEqual(continuity["content"], "钥匙已经交给林澈。")
        self.assertEqual(continuity["title"], "线索归属")
        self.assertEqual(continuity["importance_score"], 0.7)
        self.assertEqual(continuity["metadata"]["asset_type"], "continuity_fact")

        next_requirement = by_type["next_requirement"][0]
        self.assertEqual(next_requirement["content"], "下一章必须让林澈使用钥匙。")
        self.assertEqual(next_requirement["importance_score"], 0.9)
        self.assertEqual(next_requirement["metadata"]["target_chapter_number"], 12)
        self.assertEqual(next_requirement["metadata"]["lifecycle"], "next_chapter_only")

        future_payoff = [s for s in by_type["foreshadow"] if s.get("metadata", {}).get("asset_type") == "future_payoff"][0]
        self.assertEqual(future_payoff["content"], "旧钟声将在后续揭示真实来源。")
        self.assertEqual(future_payoff["is_foreshadow"], 1)

        all_contents = "\n".join(str(s.get("content") or "") for s in seeds)
        self.assertNotIn("可以增加雨夜气氛", all_contents)
        self.assertNotIn("不应自动注入", all_contents)

    def test_apply_is_idempotent_and_does_not_duplicate(self) -> None:
        SessionLocal = self._make_db()
        analysis = {
            "chapter_summary": "本章摘要",
            "hooks": [{"excerpt": "ABC", "note": "开头钩子"}],
            "plot_points": [{"beat": "冲突升级", "excerpt": "XYZ"}],
            "foreshadows": [{"excerpt": "", "note": "伏笔"}],
            "character_states": [
                {"character_name": "张三", "state_before": "平静", "state_after": "紧张", "psychological_change": ""}
            ],
        }

        with SessionLocal() as db:
            out1 = apply_chapter_analysis(
                db=db,
                request_id="req-1",
                actor_user_id="local-user",
                project_id="project-1",
                chapter_id="chapter-1",
                chapter_number=1,
                analysis=analysis,
                draft_content_md="ABC ... XYZ",
            )
            self.assertFalse(out1["idempotent"])
            plot_id = out1["plot_analysis_id"]

            ids1 = {m.id for m in db.query(StoryMemory).all()}
            self.assertGreaterEqual(len(ids1), 1)
            self.assertEqual(db.query(PlotAnalysis).count(), 1)
            self.assertEqual(db.query(GenerationRun).filter(GenerationRun.type == "analysis_apply").count(), 1)

            out2 = apply_chapter_analysis(
                db=db,
                request_id="req-2",
                actor_user_id="local-user",
                project_id="project-1",
                chapter_id="chapter-1",
                chapter_number=1,
                analysis=analysis,
                draft_content_md="ABC ... XYZ",
            )
            self.assertTrue(out2["idempotent"])
            self.assertEqual(out2["plot_analysis_id"], plot_id)

            ids2 = {m.id for m in db.query(StoryMemory).all()}
            self.assertEqual(ids1, ids2)
            self.assertEqual(db.query(PlotAnalysis).count(), 1)
            self.assertEqual(db.query(GenerationRun).filter(GenerationRun.type == "analysis_apply").count(), 1)

    def test_apply_rebuilds_managed_followup_asset_memories(self) -> None:
        SessionLocal = self._make_db()

        with SessionLocal() as db:
            apply_chapter_analysis(
                db=db,
                request_id="req-1",
                actor_user_id="local-user",
                project_id="project-1",
                chapter_id="chapter-1",
                chapter_number=1,
                analysis={
                    "chapter_summary": "本章摘要",
                    "followup_assets": [
                        {"type": "continuity_fact", "title": "旧事实", "note": "旧事实内容"},
                        {"type": "next_chapter_requirement", "title": "旧要求", "note": "旧要求内容"},
                    ],
                },
                draft_content_md="正文",
            )
            apply_chapter_analysis(
                db=db,
                request_id="req-2",
                actor_user_id="local-user",
                project_id="project-1",
                chapter_id="chapter-1",
                chapter_number=1,
                analysis={
                    "chapter_summary": "本章摘要",
                    "followup_assets": [
                        {"type": "continuity_fact", "title": "新事实", "note": "新事实内容"},
                    ],
                },
                draft_content_md="正文",
                force_reapply=True,
            )

            rows = db.query(StoryMemory).order_by(StoryMemory.memory_type.asc(), StoryMemory.title.asc()).all()
            contents = [str(row.content or "") for row in rows]
            self.assertIn("新事实内容", contents)
            self.assertNotIn("旧事实内容", contents)
            self.assertNotIn("旧要求内容", contents)
            self.assertEqual(db.query(StoryMemory).filter(StoryMemory.memory_type == "next_requirement").count(), 0)

    def test_apply_allows_zero_story_memories(self) -> None:
        SessionLocal = self._make_db()

        with SessionLocal() as db:
            out = apply_chapter_analysis(
                db=db,
                request_id="req-empty",
                actor_user_id="local-user",
                project_id="project-1",
                chapter_id="chapter-1",
                chapter_number=1,
                analysis={"chapter_summary": "", "hooks": [], "foreshadows": [], "plot_points": []},
                draft_content_md="",
            )

            self.assertFalse(out["idempotent"])
            self.assertEqual(out["memories"], [])
            self.assertEqual(db.query(PlotAnalysis).count(), 1)
            self.assertEqual(db.query(StoryMemory).count(), 0)

    def test_saved_snapshot_can_be_restored_and_marks_stale_after_content_changes(self) -> None:
        SessionLocal = self._make_db()

        with SessionLocal() as db:
            chapter = SimpleNamespace(id="chapter-1", content_md="已保存正文", active_version_id="version-1")
            save_plot_analysis_snapshot(
                db,
                project_id="project-1",
                chapter=chapter,
                analysis={"chapter_summary": "本章摘要"},
                generation_run_id="run-1",
                apply_status="success",
            )
            db.commit()

            restored = get_latest_plot_analysis_snapshot(db, chapter=chapter)
            self.assertIsNotNone(restored)
            self.assertFalse(restored["is_stale"])
            self.assertEqual(restored["analysis"]["chapter_summary"], "本章摘要")
            self.assertEqual(restored["generation_run_id"], "run-1")

            chapter.content_md = "新的已保存正文"
            stale = get_latest_plot_analysis_snapshot(db, chapter=chapter)
            self.assertTrue(stale["is_stale"])
