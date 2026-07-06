# 前端 LLM 请求超时统一修复

## Goal

所有前端“同步等待 LLM 返回结果”的请求，其浏览器请求超时应与后端实际 LLM 调用超时保持一致，避免后端已按 600 秒执行但浏览器 `apiJson` 默认 120 秒提前 abort。

当前用户项目 LLM 超时配置为 600 秒；按现有前端规则，浏览器等待时间应为 `600s + 60s`，即 660 秒。

## Requirements

- 覆盖所有已确认的前端同步 LLM 等待入口：
  - 非流式大纲生成：`/api/projects/{project_id}/outline/generate`。
  - 非流式章节生成：`/api/chapters/{chapter_id}/generate`。
  - 章节分析：`/api/chapters/{chapter_id}/analyze`。
  - 章节改写：`/api/chapters/{chapter_id}/rewrite`。
  - 记忆提议和自动记忆提议：`/api/chapters/{chapter_id}/memory/propose`、`/api/chapters/{chapter_id}/memory/propose/auto`，包括写作页、结构化记忆页、角色关系视图里的入口。
  - Fractal v2 同步重建：`/api/projects/{project_id}/fractal/rebuild` 且 `mode=llm_v2`。
  - LLM 连接测试：`/api/llm/test`。
- 前端请求超时规则统一为 `有效 LLM timeout_seconds * 1000 + 60_000`。
- 有效 LLM timeout 优先使用任务级配置；如果前端暂时没有任务级配置状态，则至少使用项目默认 LLM preset 的 `timeout_seconds`，保持与当前用户 600 秒配置一致，并避免保留 120 秒默认超时。
- 流式生成接口不新增前端固定超时。
- 只创建后台任务、不等待 LLM 完整结果的接口保持默认超时，例如图谱/世界书/数值表自动更新任务创建接口。
- `prompt_preview`、`generate-precheck`、`graph/query` 不调用 LLM，不纳入本次 LLM 超时延长。
- 向量 embedding/rerank dry-run 使用向量专用配置，不纳入本次 LLM preset 超时修复。

## Acceptance Criteria

- [ ] `frontend/src/lib/llmRequestTimeout.ts` 提供通用 JSON POST request init helper，复用现有 `resolveLlmRequestTimeoutMs`。
- [ ] 章节分析、章节改写、记忆提议、Fractal v2、LLM 连接测试不再使用 `apiJson` 默认 120 秒超时。
- [ ] 结构化记忆页统一加载项目 LLM preset，并把 `timeout_seconds` 传给 `MemoryUpdateDrawer` 和 `CharacterRelationsView`。
- [ ] 当项目 LLM 配置为 600 秒时，上述同步 LLM 请求的前端超时为 660 秒。
- [ ] 现有大纲生成、章节生成 helper 迁移到通用 helper 后行为不变。
- [ ] Targeted Vitest 通过。
- [ ] `frontend` 构建通过。
- [ ] `git diff --check` 无输出。

## Notes

- 需求源自 `docs/superpowers/plans/2026-07-06-frontend-llm-request-timeouts.md`，并经本轮质询补充了结构化记忆页和 Fractal v2 覆盖范围。
- 后端 `resolve_task_llm_config` 会优先使用任务级 LLM preset，回退项目默认 preset；当前本次修复以消除前端 120 秒提前 abort 为最低目标。
