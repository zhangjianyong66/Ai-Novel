from __future__ import annotations

import json
import unittest

from app.api.routes.chapter_analysis import build_rewrite_analysis_payload
from app.services.output_parsers import parse_chapter_analysis_output


class TestChapterAnalysisContract(unittest.TestCase):
    def test_parse_chapter_analysis_output_preserves_finalization_contract(self) -> None:
        raw = json.dumps(
            {
                "schema_version": 1,
                "chapter_summary": "主角发现线索并决定前往旧城。",
                "finalization": {
                    "verdict": "ready",
                    "reason": "章节目标完成，未发现阻断定稿问题。",
                    "recommended_action": "可以定稿，继续写下一章。",
                },
                "outline_goal": {"status": "complete", "notes": "发现线索 A，与角色 B 冲突均已完成。"},
                "blocking_issues": [],
                "optional_improvements": [
                    {
                        "title": "增强冲突张力",
                        "excerpt": "两人沉默片刻",
                        "issue": "冲突略平",
                        "recommendation": "可增加一句针锋相对的对白。",
                        "severity": "medium",
                    }
                ],
                "polish_suggestions": [
                    {
                        "title": "压缩重复描写",
                        "excerpt": "雨一直下",
                        "issue": "氛围描写重复",
                        "recommendation": "删去一处近似句。",
                        "severity": "low",
                    }
                ],
                "followup_assets": [{"type": "fact", "title": "主角已知道线索 A", "note": "下一章应承接。"}],
                "previous_issue_tracking": [{"issue": "人物动机不足", "status": "resolved", "note": "已解决。"}],
                "planning_notes": ["反派线索适合后续章节展开。"],
                "hooks": [],
                "foreshadows": [],
                "plot_points": [],
                "suggestions": [],
                "overall_notes": "可选建议不影响定稿。",
            },
            ensure_ascii=False,
        )

        data, warnings, parse_error = parse_chapter_analysis_output(raw)

        self.assertEqual(warnings, [])
        self.assertIsNone(parse_error)
        analysis = data["analysis"]
        self.assertEqual(analysis["finalization"]["verdict"], "ready")
        self.assertEqual(analysis["outline_goal"]["status"], "complete")
        self.assertEqual(len(analysis["optional_improvements"]), 1)
        self.assertEqual(analysis["followup_assets"][0]["type"], "fact")

    def test_build_rewrite_analysis_payload_prefers_blocking_issues(self) -> None:
        analysis = {
            "chapter_summary": "摘要",
            "finalization": {"verdict": "blocked", "reason": "存在阻断问题"},
            "outline_goal": {"status": "partial", "notes": "目标未完全完成"},
            "blocking_issues": [
                {"title": "补足动机", "issue": "主角行动突兀", "recommendation": "补一段触发原因。"},
            ],
            "optional_improvements": [{"title": "增强氛围", "recommendation": "多写雨声。"}],
            "polish_suggestions": [{"title": "句子更顺", "recommendation": "调整语序。"}],
            "suggestions": [{"title": "旧建议", "recommendation": "不应默认传入。"}],
        }

        out = build_rewrite_analysis_payload(analysis)

        self.assertEqual(out["rewrite_scope"], "blocking_issues_only")
        self.assertEqual(out["blocking_issues"], analysis["blocking_issues"])
        self.assertNotIn("optional_improvements", out)
        self.assertNotIn("polish_suggestions", out)
        self.assertNotIn("suggestions", out)


if __name__ == "__main__":
    unittest.main()
