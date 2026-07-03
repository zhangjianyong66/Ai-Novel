# 优化章节状态工作流交互 - Design

## Scope

第一版在写作页内部收敛章节状态和保存交互。重点修改前端写作页模型、详情区组件、写作页状态 hook，以及必要的后端接口契约。保持章节状态枚举 `planned / drafting / done` 不变。

## Existing Boundaries

- UI 入口：`frontend/src/pages/writing/WritingPageSections.tsx`
- 写作页状态编排：`frontend/src/pages/writing/useWritingPageState.ts`
- 章节编辑保存：`frontend/src/pages/writing/useChapterEditor.ts`
- 状态动作模型：`frontend/src/pages/writing/writingPageModels.ts`
- 文案：`frontend/src/pages/writing/writingPageCopy.ts`
- 章节列表：`frontend/src/components/writing/ChapterVirtualList.tsx`
- 章节 API 客户端：`frontend/src/services/chapterStore.ts`
- 后端章节接口：`backend/app/api/routes/chapters.py`
- 后端章节 schema：`backend/app/schemas/chapters.py`

## Data Flow

### 保存计划 / 保存草稿

前端调用现有 `saveChapter()`。为满足 `planned` 保存非空正文自动变 `drafting`，推荐把最终规则放在后端 `PUT /api/chapters/{chapter_id}`：

1. 请求仍不允许显式携带 `status`。
2. 后端保存字段后，如果当前状态是 `planned` 且最终 `content_md.strip()` 非空，将 `row.status` 自动改为 `drafting`。
3. 返回更新后的章节详情，前端 `applyChapterDetail` 或现有保存路径同步状态。

这样能覆盖快捷键保存、抽屉保存、自动保存队列、生成后保存等所有入口，避免只在某个按钮里做前端特殊逻辑。

### 保存并定稿

前端组合动作：

1. 如果有未保存修改，先调用 `saveChapter()`。
2. 保存成功后调用 `PATCH /api/chapters/{chapter_id}/status`，从当前最新状态 `drafting` 改为 `done`。
3. 如果保存前状态是 `planned` 且正文非空，后端保存会先返回 `drafting`，随后前端才能执行 `drafting -> done`。
4. 如果保存后仍不是 `drafting`，显示不可定稿提示。

### 退回草稿

继续使用 `PATCH /api/chapters/{chapter_id}/status` 的 `done -> drafting`，前端保留确认弹窗。退回后不删除已有记忆数据。第一版不持久化或伪造“可能过期”；只有在已有可靠数据源支持时才展示该状态。

### 更新记忆

第一版复用现有 `/api/chapters/{chapter_id}/trigger_auto_updates` 和 `MemoryUpdateDrawer` 能力，不新增记忆写入后端流程。详情区的记忆更新主动作只在 `done` 状态可用；处理中状态复用 `autoUpdatesTriggering`。

## UI Structure

`WritingEditorSection` 顶部拆为：

- 左侧：章节标题、更新时间、未保存提示。
- 右侧上层：章节工具，如 `分析`、`标注回溯`、更多菜单。
- 右侧下层或独立块：状态工作流面板。

状态工作流面板包含：

- 写作状态 badge。
- 记忆状态 badge。
- 主动作按钮。
- 次动作按钮。
- 更多菜单入口。

更多菜单包含：

- `退回计划中` 或状态纠错动作，视当前状态显示。
- `删除` 作为危险项。
- 未来可放 `复制`、`导出` 等章节工具。

## State Model

在 `writingPageModels.ts` 中新增纯函数，避免 UI 直接分支过多：

- `getChapterWorkflowState(params)`：返回写作状态、记忆状态、主动作、次动作、更多动作、提示。
- `isWorkflowActionDisabled(params)`：统一处理 loading、saving、generating、statusUpdating、autoUpdatesTriggering。
- `hasNonEmptyContent(form)`：判断 `content_md.trim().length > 0`。

推荐动作模型使用动作 id，而不是直接用目标 status：

- `save_plan`
- `save_draft`
- `save_and_finalize`
- `finalize`
- `reopen_draft`
- `update_memory`
- `retry_memory_update`
- `delete`
- `mark_planned`

UI 根据动作 id 回调到 `useWritingPageState` 中的处理函数。

## Backend Contract

推荐扩展 `update_chapter`：

- 保存内容字段后执行 `planned -> drafting` 自动迁移。
- 自动迁移只在 `row.status == "planned"` 且最终正文非空时发生。
- 不开放 `PUT` 显式改 status，继续保持状态接口的并发保护。
- 自动迁移不触发 `done` 自动更新任务，因为目标状态是 `drafting`。

兼容性影响：

- 所有现有保存入口都能获得一致行为。
- 现有显式 `PATCH /status planned -> drafting` 仍保留，用于纠错或旧入口。
- 若已有测试断言保存不改状态，需要更新为新产品规则。

## Memory Status

当前章节响应没有可靠字段表示“本章记忆已更新”。第一版采用可靠展示优先，UI 按以下规则显示：

- 非 `done` 且无已知记忆结果：`不可更新`
- `done` 且未触发中：`待更新`
- `autoUpdatesTriggering`：`更新中`
- 最近一次触发失败：`更新失败`

`已更新` 和 `可能过期` 需要后端暴露章节级 memory update 状态或任务摘要后才能完全准确实现。第一版不伪造这两个持久状态；若实现中发现已有可靠任务摘要 API，可接入，否则作为后续任务。

## Risks

- 保存并定稿是跨接口组合动作，需要处理保存成功但状态更新失败的中间状态。
- 如果记忆状态没有可靠数据源，UI 不能假装“已更新”。
- 右上区域空间有限，需要桌面端和窄屏分别验证，避免按钮换行挤压标题。
- 现有 `useAutoSave` 可能触发 `planned -> drafting`；这符合“保存非空正文自动转草稿”，但需要确认不会在用户只输入临时正文时超出预期。

## Rollback

- 后端自动转草稿逻辑可以回滚为仅前端按钮组合动作。
- 前端工作流面板可保留底层 `updateChapterStatus` 和 `saveChapter` 原接口，回滚风险主要是 UI 组件和模型函数。
