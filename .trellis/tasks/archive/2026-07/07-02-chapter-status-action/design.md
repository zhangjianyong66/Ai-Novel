# 拆分章节状态修改接口与交互技术设计

## Boundary

本任务拆分两个后端契约：

- 内容保存：`PUT /api/chapters/{chapter_id}`，只保存 `title`、`plan`、`content_md`、`summary`。
- 状态流转：`PATCH /api/chapters/{chapter_id}/status`，只修改 `status`。

前端写作页也拆成两个动作：

- “保存”只处理内容字段。
- 状态按钮只处理合法状态流转。

## Backend Contract

### Schema

新增请求 schema，例如 `ChapterStatusUpdate`：

```python
class ChapterStatusUpdate(RequestModel):
    status: Literal["planned", "drafting", "done"]
    expected_status: Literal["planned", "drafting", "done"]
```

如项目已有章节状态类型定义，优先复用。

### Endpoint

新增：

```http
PATCH /api/chapters/{chapter_id}/status
```

处理流程：

1. `require_chapter_editor` 获取章节并校验权限。
2. 读取 `current_status = str(row.status or "")`。
3. 如果 `current_status != body.expected_status`，抛出 `AppError.conflict(...)`，`details.reason = "chapter_status_conflict"`。
4. 校验 `(current_status, body.status)` 是否在合法流转集合内。
5. 合法时设置 `row.status = body.status`。
6. 调用 `_mark_vector_index_dirty(db, project_id=str(row.project_id))`。
7. `db.commit()` / `db.refresh(row)`。
8. 返回 `ok_payload(..., data={"chapter": ChapterDetailOut.model_validate(row).model_dump()})`。

合法流转集合：

```python
ALLOWED_CHAPTER_STATUS_TRANSITIONS = {
    ("planned", "drafting"),
    ("drafting", "planned"),
    ("drafting", "done"),
    ("done", "drafting"),
}
```

是否允许同状态 PATCH：第一版不作为合法流转。前端不应展示同状态动作；如果发生，按非法流转处理。

### PUT Behavior

`update_chapter` 在读取 body 后先检查 `model_fields_set`：

```python
if "status" in changed_fields:
    raise AppError.validation(
        "章节状态请通过状态接口修改",
        details={
            "reason": "chapter_status_update_requires_status_endpoint",
            "allowed_endpoint": "PATCH /api/chapters/{chapter_id}/status",
        },
    )
```

之后只处理内容字段。由于 `PUT` 不再承担 `done -> drafting`，原先 `prev_status == "done"` 且 `{status:"drafting"}` 的特殊分支应移除或被上面的新错误覆盖。

为保持定稿只读语义，`PUT` 对 `prev_status == "done"` 且尝试修改内容字段仍应拒绝，错误可继续使用现有 `chapter_done_readonly`。这保证旧客户端不能绕过只读保护直接改内容。

## Frontend Contract

### API Layer

新增服务函数：

```ts
updateChapterStatus(chapterId, {
  status,
  expected_status,
})
```

返回 `ChapterDetail`，与 `updateChapter` 一致。

更新 `UpdateChapterInput`，移除或不再使用 `status` 字段。若类型影响范围过大，至少写作页保存路径不得传 `status`。

### Writing Form Model

`ChapterForm` 改为只包含：

```ts
type ChapterForm = {
  title: string;
  plan: string;
  content_md: string;
  summary: string;
};
```

`chapterToForm` 不再映射 `status`。

`buildChapterSavePayload` 只返回内容字段；删除 `done -> drafting` 的特殊 payload 分支。

`dirty` 只由内容字段比较得出。章节只读态继续由 `activeChapter.status === "done"` 推导。

### Status Actions UI

写作页状态区域渲染：

- 当前状态徽标。
- 当前状态的合法动作按钮。

建议按钮：

- `planned`: `开始起草` -> `drafting`
- `drafting`: `标记为已规划` -> `planned`，`标记为定稿` -> `done`
- `done`: `回退为起草中` -> `drafting`

按钮禁用条件：

- 当前章节不存在。
- 正在保存或状态修改中。
- 有未保存内容修改。

禁用提示：`请先保存当前修改`。

`done -> drafting` 使用现有 `ConfirmProvider`，不要使用 `window.confirm`。

### State Update

状态动作成功后：

1. 使用返回的 `chapter` 更新 `activeChapter` / 章节详情状态。
2. 用 `chapterToForm(chapter)` 刷新表单基线。
3. 更新章节列表中对应章节的状态和更新时间。
4. 显示成功 toast。

失败时沿用 `ApiError` toast；冲突错误可提示刷新后重试，并触发当前章节重新加载。

## Data Flow

内容保存：

```text
Writing form -> buildChapterSavePayload(content only) -> PUT /chapters/{id}
  -> update content -> mark vector dirty -> return ChapterDetail -> refresh form baseline
```

状态修改：

```text
Status action button -> updateChapterStatus({status, expected_status})
  -> backend status machine + conflict check -> mark vector dirty
  -> return ChapterDetail -> refresh active chapter + form baseline + list
```

自动更新：

```text
Save and trigger button -> content save if needed -> POST /trigger_auto_updates
```

状态修改不会进入自动更新调度链。

## Compatibility And Migration

- 本任务选择破坏旧 `PUT status` 行为，原因是用户明确要求“新接口上线后，PUT 立刻禁止修改 status”。
- 前端必须在同一变更内迁移写作页，否则回退定稿会失败。
- 后端测试需要覆盖旧行为变更，避免旧规范残留。
- `.trellis/spec/backend/chapter-auto-update-guidelines.md` 和 `AGENTS.md` 必须同步更新，删除 `{status:"drafting"}` 作为保存特殊分支的描述。

## Rollback

如果前端接入出现问题，可以临时回滚前端到下拉框实现，但后端 `PUT status` 已被禁止后旧交互不可用。更安全的回滚点是同 commit 回滚整个任务。

实现时应保持变更集中，便于一次性 revert。
