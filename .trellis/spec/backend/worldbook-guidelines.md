# 世界书自动更新规范

## Scenario: 世界书页面手动触发章节级自动更新

### 1. Scope / Trigger

- Trigger: 修改 `POST /api/projects/{project_id}/worldbook_entries/auto_update` 或世界书页面“手动触发”行为。
- 该入口是章节级补跑，不是项目级世界书重建；必须避免没有章节正文时创建 `worldbook:project:*` 空跑任务。

### 2. Signatures

- API: `POST /api/projects/{project_id}/worldbook_entries/auto_update?chapter_id=<optional>`
- Scheduler: `schedule_worldbook_auto_update_task(project_id, actor_user_id, request_id, chapter_id, chapter_token, reason)`
- Task kind: `worldbook_auto_update`

### 3. Contracts

- `chapter_id` 可选。
- 传入 `chapter_id` 时，章节必须存在、属于当前项目且 `status == "done"`。
- 未传 `chapter_id` 时，后端选择当前项目最新 `status == "done"` 的章节。
- 成功响应 data 至少包含：
  - `task_id: string`
  - `chapter_id: string`
- 成功手动触发必须创建章节级幂等键：`worldbook:chapter:{chapter_id}:since:{chapter_token}:v1`。
- 手动触发不得在没有章节时创建 `worldbook:project:*` 幂等键。
- 前端世界书页面应显式传入它展示的最新 done 章节 ID，避免前后端选择不一致。

### 4. Validation & Error Matrix

- `chapter_id` 指向不存在章节 -> `AppError.not_found("章节不存在")`
- `chapter_id` 指向其他项目章节 -> `AppError.not_found("章节不存在")`
- `chapter_id` 指向非 done 章节 -> `AppError.validation(details={"reason": "chapter_not_done"})`
- 未传 `chapter_id` 且项目没有 done 章节 -> `AppError.validation(details={"reason": "no_done_chapter"})`

### 5. Good/Base/Bad Cases

- Good: 世界书页面显示“将补跑：第 N 章：标题”，触发时传该章节 ID，后端返回同一个 `chapter_id`。
- Base: 用户直接调用接口不传 `chapter_id`，后端选择最新 done 章节并返回非空 `chapter_id`。
- Bad: 没有 done 章节时仍创建 `chapter_id=null` 的 `worldbook:project:*` 任务。

### 6. Tests Required

- 后端 endpoint 测试：
  - 无 done 章节时返回 `details.reason == "no_done_chapter"`。
  - 无 done 章节时 `project_tasks` 不新增记录。
  - 有 done 章节且省略 `chapter_id` 时，响应 `chapter_id` 非空，并创建 `worldbook:chapter:*` 任务。
- 前端 helper / 页面测试：
  - 选择最新 done 章节。
  - `result.applied.no_op == true` 显示“完成但无变更”，不展示裸 JSON。

### 7. Wrong vs Correct

#### Wrong

```python
cid = str(getattr(chapter, "id", "") or "").strip() or None
task_id = schedule_worldbook_auto_update_task(..., chapter_id=cid, ...)
```

当 `chapter is None` 时会创建项目级任务，prompt 没有章节正文，容易空更新。

#### Correct

```python
if chapter is None:
    raise AppError.validation(
        "暂无已完成章节，世界书自动更新需要章节正文；请先完成章节或在章节页面触发",
        details={"reason": "no_done_chapter"},
    )
```

先在 API 边界阻断无章节手动触发，再调度章节级任务。
