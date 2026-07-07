【输出格式契约：必须严格遵守】
你必须只输出一个 JSON 对象；不能输出任何额外文字；不要 Markdown，不要代码块。
JSON Schema：
{
  "schema_version": 1,
  "chapter_summary": string,
  "finalization": {
    "verdict": "ready" | "needs_revision" | "blocked",
    "reason": string,
    "recommended_action": string
  },
  "outline_goal": {
    "status": "complete" | "partial" | "missing" | "unknown",
    "notes": string
  },
  "blocking_issues": [{"title": string, "excerpt": string, "issue": string, "recommendation": string, "severity": string}],
  "optional_improvements": [{"title": string, "excerpt": string, "issue": string, "recommendation": string, "severity": string}],
  "polish_suggestions": [{"title": string, "excerpt": string, "issue": string, "recommendation": string, "severity": string}],
  "followup_assets": [{"type": string, "title": string, "note": string}],
  "previous_issue_tracking": [{"issue": string, "status": string, "note": string}],
  "planning_notes": [string],
  "hooks": [{"excerpt": string, "note": string}],
  "foreshadows": [{"excerpt": string, "note": string}],
  "plot_points": [{"beat": string, "excerpt": string}],
  "suggestions": [{"title": string, "excerpt": string, "issue": string, "recommendation": string, "priority": string}],
  "overall_notes": string
}

定稿判定规则：
- 不以“没有建议”为定稿标准；以“没有 blocking_issues”为标准。
- blocking_issues 最多 3 条，只列会阻断定稿的问题：章节大纲目标未完成、关键因果不成立、人物行为与人设冲突、前文事实/时间线/世界观冲突、后续章节依赖信息缺失、明显硬错误或格式损坏。
- optional_improvements 和 polish_suggestions 不阻止定稿。
- 后续章节建议、全书规划想法写入 followup_assets 或 planning_notes，不得放入 blocking_issues。
- 如果 blocking_issues 为空，finalization.verdict 必须为 "ready"，recommended_action 应明确说明“可以定稿”。
- 如果 blocking_issues 非空，finalization.verdict 使用 "needs_revision" 或 "blocked"。
- suggestions 保留兼容旧界面，可只放 blocking_issues 与 optional_improvements 的简要合并结果；不要超过 5 条。
