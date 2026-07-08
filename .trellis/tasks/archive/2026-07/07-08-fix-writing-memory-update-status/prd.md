# 修复写作页记忆更新状态

## Goal

修复写作页定稿章节点击“更新记忆”后，记忆实际已经写入但状态仍显示“待更新”的问题，让作者能在写作页直接看到剧情记忆更新任务的真实状态，并能可靠重试失败或需要重跑的更新。

## Background

- 当前根因已确认：定稿章节的 `memoryStatusLabel` 只由前端瞬时状态派生，`autoUpdatesTriggering` 为真显示“更新中”，`memoryUpdateFailed` 为真显示“更新失败”，否则固定回落为“待更新”。证据：`frontend/src/pages/writing/writingPageModels.ts:165`。
- 点击“更新记忆”时，前端调用 `POST /api/chapters/{chapter_id}/trigger_auto_updates` 创建后台任务，成功后只弹出任务中心入口并清除失败标记，没有读取任务完成结果、`plot_analysis.apply_status` 或该章 `StoryMemory` 写入时间。证据：`frontend/src/pages/writing/useWritingPageState.ts:575`、`frontend/src/pages/writing/useWritingPageState.ts:596`。
- 后端触发接口是异步任务调度入口，不同步等待记忆更新完成。证据：`backend/app/api/routes/chapters.py:977`。
- `plot_auto_update` 使用章节 `updated_at` 派生幂等 key，章节内容未变化时重复触发可能复用旧任务。证据：`backend/app/services/plot_analysis_service.py:887`。
- 本地数据库调查显示，项目 `5bb61072-829e-4774-b1ac-71cc41a8d479` 第一章 `213db536-a653-4936-9d5b-dbfb9838f7a1` 已有成功的 `plot_auto_update` 和 13 条 `StoryMemory`，但写作页仍会显示“待更新”，说明主要缺陷是 UI 状态源缺失。

## Requirements

- R1: 写作页定稿章节的“记忆状态”必须由后端可持久查询的真实状态派生，不能在无错误时固定显示“待更新”。
- R2: 状态至少覆盖“待更新 / 更新中 / 已更新 / 更新失败 / 不可更新”。草稿和计划中章节仍显示“不可更新”。
- R3: “更新中”必须覆盖后台 `plot_auto_update` 任务处于 `queued` 或 `running` 的情况，不能只覆盖前端正在发起请求的几百毫秒。
- R4: “已更新”必须能在刷新页面后恢复。可接受的数据源包括该章最近成功的 `plot_auto_update`、未过期且 `apply_status=success|empty` 的 `plot_analysis`，或该章托管 `StoryMemory` 的最近更新时间；最终实现需选择一个一致、可测试的数据源。
- R5: “更新失败”必须能反映后台任务终态失败，刷新页面后仍可见，并提供进入任务中心或重试的路径。
- R6: 重试语义必须清楚。若是失败任务重试，应避免无意义复用已经失败或已成功的旧幂等任务；若产品口径允许“强制重新更新”，必须生成新的任务 token 或新增后端重跑参数。
- R7: 成功触发后仍保留任务中心入口，便于查看 `plot_auto_update` 详情、LLM run id、错误和耗时。
- R8: 不改变章节普通保存、状态流转、`trigger_auto_updates` 对草稿章节只创建索引任务的既有契约。
- R9: 已成功更新且章节内容未变化时，写作页显示“已更新”，主按钮不再是“更新记忆”；“重新更新记忆”应放在次要动作或更多动作中，并在点击时强制创建新的可执行任务，避免误触重复消耗 LLM。

## Out of Scope

- 不重做任务中心页面。
- 不改变 `plot_auto_update_v1` 对 LLM 输出、`StoryMemory` 提取和截断处理的业务逻辑。
- 不自动定稿章节，也不把保存动作恢复为自动创建长期记忆任务。
- 不修复向量 embedding 外部服务失败；该问题与写作页记忆状态显示无直接关系。

## Acceptance Criteria

- [ ] 定稿章节没有任何记忆更新记录时，写作页显示“待更新”，主按钮为“更新记忆”。
- [ ] 点击“更新记忆”后，只要后台 `plot_auto_update` 仍在排队或运行，刷新页面也显示“更新中”。
- [ ] 后台 `plot_auto_update` 成功并已应用剧情记忆后，刷新写作页显示“已更新”，不再显示“待更新”。
- [ ] 后台 `plot_auto_update` 失败后，刷新写作页显示“更新失败”，主按钮变为“重试更新记忆”或等价的失败恢复动作。
- [ ] 对草稿或计划中章节，写作页仍显示“不可更新”，且不会创建世界书、角色、剧情记忆、图谱、表格或分形记忆任务。
- [ ] 重复查看同一已更新且章节内容未变化的章节时，写作页显示“已更新”，不会把“更新记忆”作为主按钮。
- [ ] 用户显式点击“重新更新记忆”时，后端创建新的可执行更新任务，而不是复用旧的已成功任务。
- [ ] 前端单测覆盖 `memoryStatusLabel` 的新增状态模型。
- [ ] 后端或集成测试覆盖新状态查询接口/字段的 queued、running、succeeded、failed、无记录分支。
