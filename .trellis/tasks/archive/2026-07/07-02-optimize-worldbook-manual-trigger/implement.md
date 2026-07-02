# 优化世界书手动触发 - Implementation Plan

## Checklist

- [x] Backend: 修改 `backend/app/api/routes/worldbook.py` 的手动触发接口。
  - [x] 未传 `chapter_id` 时仍查找最新 done 章节。
  - [x] 找不到 done 章节时返回 validation error，`details.reason = "no_done_chapter"`。
  - [x] 有章节时继续调度章节级 `worldbook_auto_update`。

- [x] Backend tests: 增加或扩展世界书手动触发接口测试。
  - [x] 无 done 章节时返回校验错误。
  - [x] 无 done 章节时不创建 `worldbook:project:*` 任务。
  - [x] 有 done 章节时返回非空 `chapter_id` 并创建章节级任务。

- [x] Frontend state: 修改 `frontend/src/pages/worldbook/useWorldBookPageState.ts`。
  - [x] 加载章节 meta。
  - [x] 计算最新 done 章节。
  - [x] 触发时调用 `triggerWorldBookAutoUpdate(projectId, latestDoneChapter.id)`。
  - [x] 没有 done 章节时阻止触发并展示提示。

- [x] Frontend UI/copy: 修改世界书自动更新区。
  - [x] 显示将补跑的最新已完成章节。
  - [x] 没有 done 章节时禁用触发并显示提示。
  - [x] 将 `applied` 裸 JSON 改为可读摘要。
  - [x] `no_op=true` 显示“已完成，未产生世界书变更”。

- [x] Frontend tests: 增加或扩展相关模型/组件测试。
  - [x] 最新 done 章节选择逻辑。
  - [x] applied 摘要和 no_op 文案逻辑。

- [x] Verification.
  - [x] `cd backend && python -m pytest tests/test_worldbook_auto_update_endpoint.py tests/test_chapter_trigger_auto_updates_endpoint.py tests/test_worldbook_auto_update_task_scheduling.py -q`
  - [x] `cd frontend && npm test -- --run`
  - [x] `cd frontend && npm run build`

## Risk Points

- 不要改 `schedule_worldbook_auto_update_task` 的无章节能力，避免影响未来系统级任务或已有单元测试；本轮只收紧手动触发接口。
- 前端显示哪一章，就传哪一章的 ID，避免后端重新选择导致 UI 与任务不一致。
- 保留失败任务 retry 行为；retry 既有失败任务时使用原任务 params，不由本轮重定义。

## Rollback

- 后端回滚点：恢复 `trigger_worldbook_auto_update` 在无 done 章节时允许 `chapter_id=null` 调度。
- 前端回滚点：恢复触发按钮不依赖章节 meta，恢复 applied 裸 JSON 展示。
