# 章节定稿自动更新规范

## Scenario: 章节保存与自动更新触发接口

### 1. Scope / Trigger

- Trigger: 修改 `PUT /api/chapters/{chapter_id}`、`POST /api/chapters/{chapter_id}/trigger_auto_updates` 或写作页“一键保存并触发更新”行为。
- 普通保存只保存章节数据并标记索引 dirty，不创建任何 `ProjectTask`。
- `trigger_auto_updates` 用于写作页“一键保存并触发更新”补跑：草稿章节只允许创建 `vector_rebuild`、`search_rebuild`；定稿章节创建索引任务和完整章节自动更新链，不能对草稿章节创建世界书、角色、剧情记忆、图谱、表格或分形记忆任务。

### 2. Signatures

- Save API: `PUT /api/chapters/{chapter_id}`
- Trigger API: `POST /api/chapters/{chapter_id}/trigger_auto_updates`
- Trigger Body: `{ "generation_run_id"?: string | null }`
- Scheduler: `schedule_chapter_done_tasks(project_id, actor_user_id, request_id, chapter_id, chapter_token, reason)`

### 3. Contracts

- `PUT /api/chapters/{chapter_id}` 不调用 `schedule_chapter_done_tasks`、`schedule_vector_rebuild_task` 或 `schedule_search_rebuild_task`。
- `PUT` 遇到 `prev_status == "done"` 时，只允许请求体恰好为 `{ "status": "drafting" }`；不允许同时修改 `title`、`plan`、`content_md` 或 `summary`。
- 写作页前端处理“已定稿 -> 起草中”且其它字段未变的保存时，必须构造最小 payload `{ status: "drafting" }`，不能复用普通完整保存 payload。
- `POST /trigger_auto_updates` 要求章节必须存在且当前用户有编辑权限；章节 `status == "done"` 时调用完整 `schedule_chapter_done_tasks`，否则只调度 `schedule_vector_rebuild_task` 和 `schedule_search_rebuild_task`。
- `generation_run_id` 传入时作为幂等 token；未传时使用章节 `updated_at`。
- 成功响应 data 包含：
  - `tasks: Record<string, string | null>`
  - `chapter_token: string | null`

### 4. Validation & Error Matrix

- 章节不存在或无权限 -> 复用 `require_chapter_editor` 的错误语义。
- `PUT` 目标章节 `prev_status == "done"` 且请求体不是单独 `status=drafting` -> `AppError.validation(details={"reason": "chapter_done_readonly"})`，且不得修改章节或创建 `ProjectTask`。
- `POST /trigger_auto_updates` 章节 `status != "done"` -> 成功创建索引重建任务，`worldbook_auto_update`、`characters_auto_update`、`plot_auto_update`、`graph_auto_update`、`table_ai_update`、`fractal_rebuild` 等内容更新任务必须为空。

### 5. Good/Base/Bad Cases

- Good: 写作页普通保存为 `done` 后不创建任务；用户点击“一键保存并触发更新”后，后端创建章节级自动更新任务。
- Good: 写作页已保存且无未保存修改时，“一键保存并触发更新”仍可点击；保存步骤空跑成功后继续调用 `trigger_auto_updates`。
- Good: 草稿章节点击“一键保存并触发更新”只补跑 `vector_rebuild` 和 `search_rebuild`，不写入长期记忆、世界书或图谱。
- Base: 已定稿章节重复触发，调度器按 `chapter_token` 幂等并去重旧 queued 任务。
- Good: 已定稿章节要编辑时，先 `PUT {"status":"drafting"}` 回退，之后再普通保存内容。
- Good: 前端只切换草稿状态且没有编辑正文/标题/计划/摘要时，保存请求只发送 `{ "status": "drafting" }`，成功响应后再刷新表单基线。
- Bad: 普通保存或草稿章节直接调用触发接口也创建 `worldbook_auto_update` / `graph_auto_update` 等任务，污染长期记忆和图谱。
- Bad: `PUT {"status":"drafting","content_md":"..."}` 一边解锁一边修改正文，绕过定稿只读规则。
- Bad: 前端在回退草稿时仍发送完整章节表单，即使字段值未变化，也会触发 `chapter_done_readonly`。

### 6. Tests Required

- Endpoint 测试：
  - 普通 `PUT` 保存为 `done` 后不新增 `ProjectTask`。
  - `prev_status == "done"` 时，单独 `status=drafting` 可成功且不新增 `ProjectTask`。
  - `prev_status == "done"` 时，回退同时修改正文/摘要/标题/计划返回 `chapter_done_readonly`，数据库内容不变且不新增 `ProjectTask`。
  - `status != done` 时返回成功，且只新增 `vector_rebuild`、`search_rebuild`。
  - `status == done` 时保留既有幂等行为。
- Frontend 测试：
  - 基线 `status=done`、下一状态 `status=drafting` 且其它字段相同时，保存 payload 等于 `{ status: "drafting" }`。
  - 基线 `status=done`、下一状态 `status=drafting` 且内容字段变化时，保存 payload 保持完整字段，由后端只读校验拒绝。

### 7. Wrong vs Correct

#### Wrong

```python
row = require_chapter_editor(...)
db.commit()
schedule_chapter_done_tasks(..., chapter_id=row.id, ...)
```

#### Correct

```python
row = require_chapter_editor(...)
if str(row.status or "") == "done" and body.model_fields_set != {"status"}:
    raise AppError.validation(..., details={"reason": "chapter_done_readonly"})
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
