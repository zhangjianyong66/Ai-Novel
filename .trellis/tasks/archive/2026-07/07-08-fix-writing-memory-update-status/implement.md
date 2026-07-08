# 实施计划：修复写作页记忆更新状态

## Checklist

1. 读取相关上下文
   - `.trellis/spec/backend/chapter-auto-update-guidelines.md`
   - `.trellis/spec/frontend/hook-guidelines.md`
   - `.trellis/spec/frontend/state-management.md`
   - `.trellis/spec/guides/cross-layer-thinking-guide.md`

2. 后端状态摘要
   - 确定状态摘要接口位置：优先扩展章节详情响应；若影响面过大，则新增章节级只读接口。
   - 实现 `plot_auto_update` 最近任务、`plot_analysis.apply_status`、`StoryMemory` 最近更新时间的查询和状态派生。
   - 为 queued、running、succeeded、failed、无记录、草稿章节编写后端测试。

3. 重试/重跑语义
   - 已更新且章节内容未变化时，写作页显示“已更新”，不把“更新记忆”作为主按钮。
   - 将“重新更新记忆”放到次要动作或更多动作中。
   - 新增兼容字段或显式 token 支持强制重跑，默认不改变既有幂等行为。

4. 前端状态模型
   - 将 `memoryUpdateFailed` 布尔状态替换或收敛为 typed memory update status。
   - 更新 `buildChapterWorkflowState` 和按钮文案。
   - 触发更新成功后刷新状态摘要；若接入 SSE，监听 `plot_auto_update` 当前章节事件并刷新。
   - 更新 `writingPageModels.test.ts`。

5. 验证
   - 后端：运行相关 `unittest` 或 pytest 子集。
   - 前端：运行 `cd frontend && npm run lint`，以及相关 Vitest。
   - 手动：Docker 环境点击第一章“更新记忆”，确认后台任务成功后写作页显示“已更新”。

## Validation Commands

```bash
cd backend && .venv/bin/python -m unittest tests.test_chapter_trigger_auto_updates_endpoint
cd backend && .venv/bin/python -m unittest tests.test_plot_auto_update_service
cd frontend && npm test -- writingPageModels
cd frontend && npm run lint
```

## Risks

- `ProjectTask.params_json` 是文本 JSON，跨 SQLite/PostgreSQL 查询不能直接依赖单一数据库 JSON 语法。
- 状态摘要如果放入章节详情，会影响前端章节类型和多个消费者；新增接口影响面更小但请求更多。
- “强制重新更新”如果默认主按钮触发，可能造成重复 LLM 消耗。

## Rollback

- 后端新增只读状态摘要可独立回滚，不影响已有章节触发接口。
- 前端状态模型改动可回退为旧布尔显示，但需保留测试证明问题会复现。
