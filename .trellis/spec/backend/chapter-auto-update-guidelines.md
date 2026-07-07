# 章节定稿自动更新规范

## Scenario: 章节分析结果持久化与自动应用剧情记忆

### 1. Scope / Trigger

- Trigger: 修改章节分析、章节改写、剧情记忆应用、`plot_analysis` 表、写作页分析弹窗恢复逻辑。
- 手动章节分析是“已保存章节内容”的分析，不支持未保存草稿分析。
- 每章只保留最近一次解析成功的分析结果；历史回看不属于当前契约。

### 2. Signatures

- DB: `plot_analysis(id, project_id, chapter_id, analysis_json, generation_run_id, chapter_content_hash, chapter_active_version_id, apply_status, apply_error_json, created_at, updated_at)`
- Analyze API: `POST /api/chapters/{chapter_id}/analyze`
- Restore API: `GET /api/chapters/{chapter_id}/analysis`
- Retry API: `POST /api/chapters/{chapter_id}/analysis/retry_apply`
- Service helpers:
  - `save_plot_analysis_snapshot(db, project_id, chapter, analysis, generation_run_id, apply_status, apply_error?)`
  - `get_latest_plot_analysis_snapshot(db, chapter)`
  - `apply_chapter_analysis(..., force_reapply=False)`

### 3. Contracts

- `POST /analyze` 请求体不得携带 `draft_title`、`draft_plan`、`draft_summary`、`draft_content_md`；分析必须使用数据库中已保存章节内容。
- LLM 输出解析成功后，后端写入/更新该章唯一 `plot_analysis` 行，记录：
  - `analysis_json`: 规范化后的结构化分析。
  - `generation_run_id`: 本次 `chapter_analyze` run id。
  - `chapter_content_hash`: 当前 `chapters.content_md` 的 SHA-256。
  - `chapter_active_version_id`: 当前 `chapters.active_version_id`。
  - `apply_status`: `pending`、`success`、`empty`、`failed`。
- 解析失败不得覆盖已有 `plot_analysis`。
- 分析持久化后立即自动调用 `apply_chapter_analysis(..., force_reapply=True)` 更新该章托管剧情记忆。
- 自动应用失败不得回滚已保存分析；只更新 `apply_status="failed"` 和 `apply_error_json`。
- 0 条剧情记忆是成功空结果，`apply_status="empty"`，不是 `INTERNAL_ERROR`。
- `GET /analysis` 返回 `analysis_result: null | object`，并基于当前章节 hash / active version 计算 `is_stale`。
- `POST /analysis/retry_apply` 只允许对未过期分析重试；过期分析必须重新分析。
- `plot_auto_update_v1` 必须保留模型配置页或任务预设解析后的 `max_tokens`；重试只允许覆盖必要的采样参数（例如 `temperature`），不得用 `2048/1024/512` 等固定小上限覆盖输出预算。
- `plot_auto_update_v1` 解析到 `finish_reason="length"` 或 `warnings` 包含 `output_truncated` 时，必须返回失败（`reason="output_truncated"`）且不得调用 `apply_chapter_analysis`，避免删除旧 `StoryMemory` 后只写入截断片段。

### 4. Validation & Error Matrix

- `POST /analyze` 携带任一草稿字段 -> `VALIDATION_ERROR details.reason="chapter_analysis_requires_saved_chapter"`。
- 章节不存在或无权限 -> 复用 `require_chapter_viewer/editor` 语义。
- LLM 输出 `parse_error != None` -> 响应当次解析失败信息，不更新 `plot_analysis`。
- `plot_auto_update_v1` 输出被截断 -> `ok=false reason="output_truncated"`，保留旧 `plot_analysis` 和旧 `StoryMemory`，任务错误详情应提示提高 `max_tokens` 后重试。
- `POST /analysis/retry_apply` 无持久化分析 -> `NOT_FOUND`。
- `POST /analysis/retry_apply` 分析已过期 -> `VALIDATION_ERROR details.reason="chapter_analysis_stale"`。
- `POST /analysis/retry_apply` 持久化分析为空或损坏 -> `VALIDATION_ERROR details.reason="chapter_analysis_empty"`。
- 自动应用抛出 `AppError` 或未知异常 -> 响应 `apply_result.status="failed"`，并持久化脱敏后的错误摘要。

### 5. Good/Base/Bad Cases

- Good: 用户保存章节后点击分析，刷新页面再打开弹窗，前端通过 `GET /analysis` 恢复最近一次分析和应用状态。
- Good: 用户修改并保存正文后，旧分析仍可查看但 `is_stale=true`，前端禁用“按建议重写”和保存/重试应用剧情记忆。
- Good: 分析成功但没有可提取剧情记忆，弹窗显示“未提取到可写入的剧情记忆”。
- Base: 重新分析同一章会覆盖该章托管剧情记忆，但不删除手动创建的记忆。
- Bad: 前端把未保存编辑器正文作为 `draft_content_md` 发给 `/analyze`，刷新后分析结果与保存正文不匹配。
- Bad: 自动应用失败时回滚 `plot_analysis`，导致用户刷新后丢失已经成功生成的分析结果。

### 6. Tests Required

- 后端测试：
  - `POST /analyze` 携带草稿字段时返回 `chapter_analysis_requires_saved_chapter`。
  - 解析成功后保存 snapshot，可通过 `get_latest_plot_analysis_snapshot` 恢复。
  - 章节正文 hash 变化后 snapshot 返回 `is_stale=true`。
  - `apply_chapter_analysis` 允许 0 条 seeds，返回 `memories=[]` 且不抛错。
  - `plot_auto_update_v1` 继续可应用剧情记忆，不被新增字段破坏。
  - `plot_auto_update_v1` 遇到 `finish_reason="length"` / `output_truncated` 时不应用结果、不删除旧 `StoryMemory`。
  - `plot_auto_update_v1` 调用 LLM 时不得在 `llm_call_overrides_by_attempt` 中写入固定 `max_tokens` 小上限。
- 前端测试/检查：
  - 有 dirty 状态时禁用/阻止分析。
  - 过期分析禁用重写和保存/重试应用。
  - `apiJson<T>()` 的 `T` 使用后端 `data` 内部结构，不包装完整 `ok` 响应。

### 7. Wrong vs Correct

#### Wrong

```typescript
await apiJson<ChapterAnalyzeResult>(`/api/chapters/${chapterId}/analyze`, {
  method: "POST",
  body: JSON.stringify({ draft_content_md: form.content_md }),
});
```

#### Correct

```typescript
if (dirty) {
  toast.toastError("请先保存当前修改，再执行章节分析。");
  return;
}
await apiJson<ChapterAnalyzeResult>(
  `/api/chapters/${chapterId}/analyze`,
  buildLlmJsonRequestInit({ headers, payload, llmTimeoutSeconds: preset.timeout_seconds }),
);
```

#### Correct

```python
save_plot_analysis_snapshot(...)
try:
    out = apply_chapter_analysis(..., force_reapply=True)
except Exception as exc:
    update_plot_analysis_apply_status(db, chapter_id=chapter_id, status="failed", error=error_payload(exc))
```

## Scenario: 章节保存与自动更新触发接口

### 1. Scope / Trigger

- Trigger: 修改 `PUT /api/chapters/{chapter_id}`、`PATCH /api/chapters/{chapter_id}/status`、`POST /api/chapters/{chapter_id}/trigger_auto_updates` 或写作页“一键保存并触发更新”行为。
- 普通保存只保存章节数据并标记索引 dirty，不创建任何 `ProjectTask`。例外：`planned` 章节保存后若最终 `content_md.strip()` 非空，保存接口会自动把状态提升为 `drafting`。
- `trigger_auto_updates` 用于写作页“一键保存并触发更新”补跑：草稿章节只允许创建 `vector_rebuild`、`search_rebuild`；定稿章节创建索引任务和完整章节自动更新链，不能对草稿章节创建世界书、角色、剧情记忆、图谱、表格或分形记忆任务。

### 2. Signatures

- Save API: `PUT /api/chapters/{chapter_id}`
- Status API: `PATCH /api/chapters/{chapter_id}/status`
- Trigger API: `POST /api/chapters/{chapter_id}/trigger_auto_updates`
- Status Body: `{ "status": "planned" | "drafting" | "done", "expected_status": "planned" | "drafting" | "done" }`
- Trigger Body: `{ "generation_run_id"?: string | null }`
- Scheduler: `schedule_chapter_done_tasks(project_id, actor_user_id, request_id, chapter_id, chapter_token, reason)`

### 3. Contracts

- `PUT /api/chapters/{chapter_id}` 不调用 `schedule_chapter_done_tasks`、`schedule_vector_rebuild_task` 或 `schedule_search_rebuild_task`，且请求体不得显式携带 `status`。
- `PUT /api/chapters/{chapter_id}` 的唯一自动状态变化是：当前状态为 `planned`，保存字段应用后的最终 `content_md.strip()` 非空时，后端把章节状态改为 `drafting`。保存空白正文、标题、计划或摘要不改变 `planned`。
- `PATCH /api/chapters/{chapter_id}/status` 是章节状态修改唯一入口；允许 `planned -> drafting`、`drafting -> planned`、`drafting -> done`、`done -> drafting`，成功时只修改状态并标记 vector dirty，不创建任何 `ProjectTask`。
- 写作页前端状态修改必须使用独立状态动作按钮；保存 payload 不得包含 `status`。
- `POST /trigger_auto_updates` 要求章节必须存在且当前用户有编辑权限；章节 `status == "done"` 时调用完整 `schedule_chapter_done_tasks`，否则只调度 `schedule_vector_rebuild_task` 和 `schedule_search_rebuild_task`。
- `generation_run_id` 传入时作为幂等 token；未传时使用章节 `updated_at`。
- 成功响应 data 包含：
  - `tasks: Record<string, string | null>`
  - `chapter_token: string | null`

### 4. Validation & Error Matrix

- 章节不存在或无权限 -> 复用 `require_chapter_editor` 的错误语义。
- `PUT` 请求体包含 `status` -> `AppError.validation(details={"reason": "chapter_status_update_requires_status_endpoint"})`，且不得修改章节或创建 `ProjectTask`。
- `PUT` 目标章节 `prev_status == "done"` 且尝试修改内容字段 -> `AppError.validation(details={"reason": "chapter_done_readonly"})`，且不得修改章节或创建 `ProjectTask`。
- `PUT` 目标章节 `prev_status == "planned"` 且最终正文非空 -> 成功保存并返回 `status="drafting"`，不得创建 `ProjectTask`。
- `PATCH /status` 的 `expected_status` 与数据库当前状态不一致 -> `AppError.conflict(details={"reason": "chapter_status_conflict"})`。
- `PATCH /status` 非法状态流转 -> `AppError.validation(details={"reason": "invalid_chapter_status_transition"})`。
- `POST /trigger_auto_updates` 章节 `status != "done"` -> 成功创建索引重建任务，`worldbook_auto_update`、`characters_auto_update`、`plot_auto_update`、`graph_auto_update`、`table_ai_update`、`fractal_rebuild` 等内容更新任务必须为空。

### 5. Good/Base/Bad Cases

- Good: 写作页通过 `PATCH /status` 标记为 `done` 后不创建任务；用户点击“一键保存并触发更新”后，后端创建章节级自动更新任务。
- Good: 写作页已保存且无未保存修改时，“一键保存并触发更新”仍可点击；保存步骤空跑成功后继续调用 `trigger_auto_updates`。
- Good: 草稿章节点击“一键保存并触发更新”只补跑 `vector_rebuild` 和 `search_rebuild`，不写入长期记忆、世界书或图谱。
- Base: 已定稿章节重复触发，调度器按 `chapter_token` 幂等并去重旧 queued 任务。
- Good: 已定稿章节要编辑时，先 `PATCH /status {"status":"drafting","expected_status":"done"}` 回退，之后再普通保存内容。
- Good: 计划中章节保存非空正文时自动变为草稿；保存空白正文或仅保存标题/计划/摘要时仍保持计划中。
- Good: 前端只切换状态且没有未保存内容修改时，调用 `PATCH /status`，成功响应后刷新表单基线。
- Bad: 普通保存或草稿章节直接调用触发接口也创建 `worldbook_auto_update` / `graph_auto_update` 等任务，污染长期记忆和图谱。
- Bad: `PUT {"status":"drafting","content_md":"..."}` 一边解锁一边修改正文，绕过状态接口。
- Bad: 前端在回退草稿时通过保存表单提交 `status`。

### 6. Tests Required

- Endpoint 测试：
  - `PUT` 请求体包含 `status` 时返回 `chapter_status_update_requires_status_endpoint`，数据库内容不变且不新增 `ProjectTask`。
  - `PUT` 计划中章节保存空白正文时仍为 `planned`，且不新增 `ProjectTask`。
  - `PUT` 计划中章节保存非空正文时返回并持久化为 `drafting`，且不新增 `ProjectTask`。
  - `PATCH /status` 合法流转可成功且不新增 `ProjectTask`。
  - `PATCH /status` 状态冲突返回 `chapter_status_conflict`。
  - `PATCH /status` 非法流转返回 `invalid_chapter_status_transition`。
  - `prev_status == "done"` 时，通过 `PUT` 修改正文/摘要/标题/计划返回 `chapter_done_readonly`，数据库内容不变且不新增 `ProjectTask`。
  - `status != done` 时返回成功，且只新增 `vector_rebuild`、`search_rebuild`。
  - `status == done` 时保留既有幂等行为。
- Frontend 测试：
  - 保存 payload 不包含 `status`。
  - 写作页按当前状态只展示合法状态动作；有未保存内容修改时状态动作禁用。
  - `done -> drafting` 使用确认弹窗，其它状态动作不弹确认。

### 7. Wrong vs Correct

#### Wrong

```python
if "status" in changed_fields:
    row.status = body.status
if row.status == "done":
    schedule_chapter_done_tasks(..., chapter_id=row.id, ...)
```

## Scenario: 章节 AI 正文版本即时保存

### 1. Scope / Trigger

- Trigger: 修改章节 AI 生成、流式生成、章节优化/改写、章节详情、章节版本列表/预览/激活或 `chapters.content_md` 保存行为。
- 后端拿到完整 AI 正文后必须立即落库为章节正文版本并激活，不能依赖前端确认保存。
- 版本只管理 `content_md`，不回滚标题、计划、摘要或状态。

### 2. Signatures

- DB:
  - `chapter_versions(id, project_id, chapter_id, source, content_md, word_count, generation_run_id, provider, model, meta_json, created_at)`
  - `chapters.active_version_id -> chapter_versions.id`
- AI endpoints:
  - `POST /api/chapters/{chapter_id}/generate`
  - `POST /api/chapters/{chapter_id}/generate-stream`
  - `POST /api/chapters/{chapter_id}/rewrite`
- Version endpoints:
  - `GET /api/chapters/{chapter_id}/versions`
  - `GET /api/chapters/{chapter_id}/versions/{version_id}`
  - `POST /api/chapters/{chapter_id}/versions/{version_id}/activate`

### 3. Contracts

- AI 生成/优化最终 `content_md` 非空且无 `parse_error` 时，调用统一版本服务创建并激活版本。
- `source` 取值：
  - `ai_generate`: 章节生成最终正文。
  - `ai_optimize`: 正文优化、章节改写最终正文。
  - `manual_snapshot`: AI 覆盖前的当前正文快照。
- AI 覆盖前如果 `chapters.active_version_id` 为空、版本不存在、版本章节不匹配或版本正文不等于 `chapters.content_md`，先创建 `manual_snapshot`；如果当前正文已等于激活版本，不重复创建快照。
- 激活版本必须同步：
  - `chapters.content_md = chapter_versions.content_md`
  - `chapters.active_version_id = chapter_versions.id`
  - `project_settings.vector_index_dirty = true`
- 手动 `PUT /api/chapters/{chapter_id}` 保存 `content_md` 时不创建版本，并清空 `chapters.active_version_id`，表示当前正文没有对应版本。
- AI 接口保留旧正文字段，同时新增 `saved_version` 和 `active_version` 摘要字段。

### 4. Validation & Error Matrix

- 章节不存在或无读取权限 -> 版本列表/详情复用章节读取权限错误。
- 章节不存在或无编辑权限 -> 激活版本复用章节编辑权限错误。
- `version_id` 不存在或不属于该章节 -> `AppError.not_found("章节版本不存在")`。
- `chapter.status == "done"` 时激活版本 -> `AppError.validation(details={"reason": "chapter_done_readonly"})`。
- AI 最终正文为空或存在 `parse_error` -> 不创建版本，按既有生成响应/错误契约返回。

### 5. Good/Base/Bad Cases

- Good: 非流式生成成功后，响应含 `saved_version`，刷新章节详情时 `content_md` 已是生成正文。
- Good: 流式生成只在最终结果事件前保存一次版本，中间 token 不写库。
- Good: 用户手动修改正文并保存后 `active_version_id` 为空；下一次 AI 操作先创建 `manual_snapshot`。
- Base: 两次 AI 并发生成都保存为历史版本，最后完成者成为当前版本。
- Bad: 前端收到 AI 正文后等待用户确认才保存，网络中断会丢失模型结果。
- Bad: 版本激活直接创建 `ProjectTask`，绕过显式 `trigger_auto_updates` 语义。

### 6. Tests Required

- 服务测试：
  - 首次 AI 保存创建 `manual_snapshot` 和 AI 版本，并同步章节正文/active 指针。
  - 当前正文等于 active version 时，连续 AI 保存不重复创建快照。
  - 激活历史版本同步 `chapters.content_md` 和 `active_version_id`。
  - `done` 章节激活版本返回 `chapter_done_readonly`。
- 路由测试：
  - viewer 可列表/预览版本，不能激活版本。
  - editor 可激活版本。
  - 手动保存 `content_md` 清空 `active_version_id`。
- 迁移测试：
  - SQLite 临时库可 `alembic upgrade head`。

### 7. Wrong vs Correct

#### Wrong

```python
data = run_chapter_generate(...)
return ok_payload(data=data)  # 等前端确认后再 PUT /chapters/{id}
```

#### Correct

```python
data = run_chapter_generate(...)
version = create_and_activate_chapter_version(
    db=db,
    chapter=chapter,
    content_md=data["content_md"],
    source="ai_generate",
    generation_run_id=data["generation_run_id"],
)
data["saved_version"] = chapter_version_summary(version, active_version_id=chapter.active_version_id)
return ok_payload(data=data)
```

#### Correct

```python
row = require_chapter_editor(...)
if "status" in changed_fields:
    raise AppError.validation(..., details={"reason": "chapter_status_update_requires_status_endpoint"})
prev_status = str(row.status or "")
if prev_status == "done" and changed_fields:
    raise AppError.validation(..., details={"reason": "chapter_done_readonly"})
...
if prev_status == "planned" and str(row.content_md or "").strip():
    row.status = "drafting"
db.commit()

chapter = require_chapter_editor(...)
if str(chapter.status or "") == "done":
    tasks = schedule_chapter_done_tasks(..., chapter_id=chapter.id, ...)
else:
    tasks = {
        "vector_rebuild": schedule_vector_rebuild_task(...),
        "search_rebuild": schedule_search_rebuild_task(...),
        "worldbook_auto_update": None,
    }
```
