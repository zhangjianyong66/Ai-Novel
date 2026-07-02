# 拆分章节状态修改接口与交互

## Goal

将章节状态修改从章节内容保存中拆分为独立动作，避免 `PUT /api/chapters/{chapter_id}` 同时承担内容保存和状态流转。用户在写作页应通过明确的状态动作按钮修改章节状态，后端应通过独立接口统一执行状态机校验、并发保护和错误契约。

## Background

- 当前后端 `PUT /api/chapters/{chapter_id}` 同时接收 `title`、`plan`、`content_md`、`summary` 和 `status`。
- 当前已定稿章节回退编辑依赖特殊 payload `{ "status": "drafting" }`，前端 `buildChapterSavePayload` 需要识别这个例外。
- 现有项目规范要求普通保存不创建任何 `ProjectTask`；只有 `POST /api/chapters/{chapter_id}/trigger_auto_updates` 显式触发后台更新任务。
- 本任务需要同步更新 `.trellis/spec/backend/chapter-auto-update-guidelines.md` 和根目录 `AGENTS.md` 中关于章节状态修改的旧约定。

## Requirements

### R1 独立状态接口

- 新增 `PATCH /api/chapters/{chapter_id}/status`。
- 请求体包含：
  - `status`: 目标状态。
  - `expected_status`: 前端看到的当前状态，用于轻量并发保护。
- 成功响应返回完整章节详情，响应结构与现有章节详情更新接口保持一致。
- 接口要求当前用户具备章节编辑权限。
- 接口成功时只修改章节状态并调用 `_mark_vector_index_dirty`，不创建任何 `ProjectTask`。

### R2 后端状态机

- 后端必须只允许明确的合法流转：
  - `planned -> drafting`
  - `drafting -> planned`
  - `drafting -> done`
  - `done -> drafting`
- 后端必须拒绝未列出的流转，例如 `planned -> done`、`done -> planned`。
- 状态冲突时返回 409，`details.reason` 为 `chapter_status_conflict`，并包含 `expected_status` 和 `current_status`。
- 非法流转返回 400，`details.reason` 为 `invalid_chapter_status_transition`，并包含 `from_status` 和 `to_status`。

### R3 内容保存接口不再修改状态

- `PUT /api/chapters/{chapter_id}` 不再允许请求体包含 `status` 字段。
- 只要 `PUT` payload 包含 `status`，统一返回 400 validation。
- 错误 `details.reason` 为 `chapter_status_update_requires_status_endpoint`，并包含允许使用的新接口提示。
- `PUT` 仍负责保存内容字段并标记 vector dirty，且不得创建 `ProjectTask`。

### R4 前端状态动作交互

- 写作页移除状态下拉框。
- 状态展示改为“状态徽标 + 当前状态的合法动作按钮”。
- 状态动作与保存按钮彻底分开。
- 状态动作只在没有未保存内容修改时允许执行；有 dirty 内容时禁用并提示需先保存。
- `done -> drafting` 必须二次确认；其它状态切换不弹确认。
- `done -> drafting` 确认文案需说明回退后解除只读保护，已有世界书、角色、记忆、图谱等更新结果不会自动回滚。
- 状态动作成功后用接口返回的完整章节刷新当前章节详情和编辑基线。

### R5 前端表单模型拆分

- 写作页编辑表单模型不再包含 `status`。
- `dirty` 只比较 `title`、`plan`、`content_md`、`summary`。
- 保存内容时不再构造或提交 `status`。
- 删除当前 `{ status: "drafting" }` 的保存特殊分支和对应旧测试，改为测试新状态动作。

### R6 自动更新边界保持不变

- 修改状态不默认触发章节自动更新任务。
- `drafting -> done` 只改状态，不创建 `ProjectTask`。
- 触发更新仍通过“一键保存并触发更新”或 `POST /api/chapters/{chapter_id}/trigger_auto_updates` 完成。

## Out Of Scope

- 不新增“一步定稿并触发自动更新”的混合接口。
- 不改变 `POST /api/chapters/{chapter_id}/trigger_auto_updates` 的调度语义。
- 不做批量章节状态修改。
- 不引入 `updated_at` 乐观锁；本任务只使用 `expected_status`。

## Acceptance Criteria

- [x] `PATCH /api/chapters/{chapter_id}/status` 可以完成所有合法状态流转，并返回完整章节详情。
- [x] `PATCH /api/chapters/{chapter_id}/status` 在 `expected_status` 与数据库当前状态不一致时返回 409 `chapter_status_conflict`。
- [x] `PATCH /api/chapters/{chapter_id}/status` 拒绝非法流转，并返回 400 `invalid_chapter_status_transition`。
- [x] `PATCH /api/chapters/{chapter_id}/status` 成功时调用 `_mark_vector_index_dirty`，但不创建 `ProjectTask`。
- [x] `PUT /api/chapters/{chapter_id}` 收到任何 `status` 字段时返回 400 `chapter_status_update_requires_status_endpoint`。
- [x] `PUT /api/chapters/{chapter_id}` 保存内容时不创建 `ProjectTask` 的既有行为保持不变。
- [x] 写作页不再展示章节状态下拉框，而是展示状态徽标和合法动作按钮。
- [x] 写作页有未保存内容修改时，状态动作不可执行并提示先保存。
- [x] 写作页执行 `done -> drafting` 前出现二次确认，其它状态动作不确认。
- [x] 写作页状态动作成功后刷新当前章节详情和表单基线。
- [x] 前端保存 payload 不再包含 `status`。
- [x] 更新 `.trellis/spec/backend/chapter-auto-update-guidelines.md` 和 `AGENTS.md` 中被新设计取代的章节状态修改约定。
