# 优化世界书手动触发

## Goal

优化世界书页面的“手动触发”自动更新功能，将其明确为“补跑最新已完成章节”的章节级世界书更新，避免没有章节正文时静默创建项目级空跑任务，并让用户能看懂任务实际是否修改了世界书。

触发本任务的直接问题：手动触发任务 `56c4319b-56e0-4394-a8f8-9d7e964d1323` 成功执行但 `applied.no_op=true`。该任务 `chapter_id=null`，prompt 中 `chapter_summary` 与 `chapter_content_md` 为空；模型原始输出为空，JSON 修复后得到 `ops: []`，最终没有创建、更新或删除世界书条目。

## Confirmed Facts

- 前端 API `triggerWorldBookAutoUpdate(projectId, chapterId?)` 支持传入可选 `chapterId`，但世界书页面当前调用时只传 `projectId`。代码位置：`frontend/src/services/worldbookApi.ts:204`，`frontend/src/pages/worldbook/useWorldBookPageState.ts:126`。
- 后端接口 `POST /api/projects/{project_id}/worldbook_entries/auto_update` 在未传 `chapter_id` 时，会自动选择该项目最新的 `status = done` 章节；如果没有 done 章节，则 `chapter_id=null`，任务退化为项目级触发。代码位置：`backend/app/api/routes/worldbook.py:119`。
- 世界书自动更新服务只有在 `chapter_id` 存在且章节属于项目时，才读取章节 `summary` 和 `content_md` 放入 prompt。代码位置：`backend/app/services/worldbook_auto_update_service.py:668`。
- 章节 meta 接口和前端缓存已提供章节编号、标题、状态、更新时间、是否有正文等信息，可用于世界书页面展示“将补跑的最新已完成章节”。代码位置：`frontend/src/services/chaptersApi.ts:47`，`backend/app/api/routes/chapters.py:559`。
- 现有任务结果会记录 `result.applied.created/updated/deleted/skipped/no_op`，世界书页面当前只把 `applied` 裸 JSON 展示出来。代码位置：`frontend/src/pages/worldbook/WorldBookPageSections.tsx:191`。

## Requirements

- 当前世界书页面【手动触发】定义为“补跑最新已完成章节”的世界书自动更新，而不是项目级从大纲/世界观重建世界书。
- MVP 不做章节选择器；有多个已完成章节时，自动选择最新已完成章节，并在 UI 上明确显示将补跑的章节。
- 世界书页面应在触发前通过章节 meta 判断是否存在 `status=done` 的章节；没有已完成章节时，禁用或阻止【手动触发】。
- 没有已完成章节时，用户应看到提示：“暂无已完成章节，世界书自动更新需要章节正文；请先完成章节或在章节页面触发”。
- 后端接口也必须强化边界：手动触发接口找不到已完成章节时，返回校验错误，不再创建 `worldbook:project:*` 项目级世界书自动更新任务。
- 当用户显式传入 `chapter_id` 时，后端仍必须校验章节存在、属于当前项目且 `status=done`；现有 `chapter_not_done` 语义保留。
- 触发成功后，任务状态区域应清楚表达本次实际创建、更新、删除或跳过的条目数量。
- 当 `result.applied.no_op=true` 时，任务状态区域显示“已完成，未产生世界书变更”，并说明“模型未提出可应用的新增/合并/更新条目；本次没有修改世界书”。该状态不按失败处理，也不只显示裸 JSON。
- 优化应兼容现有章节定稿后的后台自动调度；`schedule_chapter_done_tasks` 传入章节 ID 的自动任务链路不应被破坏。

## Acceptance Criteria

- [ ] 有至少一个 done 章节时，世界书页面显示将补跑的最新已完成章节信息，并允许触发。
- [ ] 有多个 done 章节时，MVP 自动选择最新已完成章节；本轮不实现章节选择器。
- [ ] 没有 done 章节时，世界书页面禁用或阻止【手动触发】，显示约定提示，不调用接口创建任务。
- [ ] 没有 done 章节且直接调用手动触发接口时，后端返回校验错误，不创建 `worldbook:project:*` 任务。
- [ ] 触发成功后返回和展示的 `chapter_id` 必须是最新已完成章节 ID，不应为 `null`。
- [ ] 成功但 `result.applied.no_op=true` 时，UI 显示“已完成，未产生世界书变更”和解释文案。
- [ ] 有实际变更时，UI 以可读形式展示 created / updated / deleted / skipped 数量，不只展示裸 JSON。
- [ ] 后台章节定稿自动触发世界书更新的现有测试仍通过。

## Out of Scope

- 本轮不做章节选择器。
- 本轮不做项目级“从大纲/世界观重建世界书”入口。
- 本轮不改大模型 prompt 策略，也不改变世界书 ops 应用逻辑。

## Open Questions

- 无。
