# 持久化章节分析结果执行计划

## Checklist

1. 阅读相关后端/前端规范和现有测试。
2. 扩展 `PlotAnalysis` 模型和 Alembic 迁移。
3. 调整 `apply_chapter_analysis`，允许 0 条剧情记忆成功返回。
4. 增加后端分析持久化/状态 helper，并改造 `analyze_chapter` 自动保存和自动应用。
5. 增加 `GET /chapters/{chapter_id}/analysis` 和 `POST /chapters/{chapter_id}/analysis/retry_apply`。
6. 收紧后端草稿分析请求校验。
7. 增加/更新后端单测，覆盖持久化、过期判断、自动应用失败、0 记忆、草稿拒绝。
8. 改造前端 `useChapterAnalysis`：按需恢复、禁用脏状态分析、处理 apply 状态和过期状态。
9. 改造 `ChapterAnalysisModal`：保留常驻“保存到记忆库”按钮，展示应用状态、重试入口和过期限制。
10. 增加/更新前端纯函数或 hook 相关测试。
11. 运行针对性后端测试和前端 lint/测试。
12. 若发现可复用项目约定，更新 `AGENTS.md`。

## Validation

- 后端优先运行：
  - `cd backend && .venv/bin/python -m unittest tests.test_plot_analysis_apply`
  - 新增测试所在模块的 `unittest` 或可用 `pytest` 命令。
- 前端优先运行：
  - `cd frontend && npm run lint`
  - 相关 `vitest` 测试（若现有配置可运行）。

## Risk Points

- `apply_chapter_analysis` 当前内部提交事务，分析保存和应用失败隔离需要谨慎处理，避免失败回滚已保存分析。
- `plot_auto_update_v1` 依赖 `apply_chapter_analysis`，不能破坏后台任务。
- 写作页有多个保存/生成/重写状态，禁用分析需要与现有 `dirty` 判断一致。
- `analysis` 类型较大，前后端响应和 Pydantic 校验要复用现有限制。
