# 优化世界书手动触发 - Design

## Scope

本设计覆盖世界书页面【手动触发】的前端预检/展示、后端手动触发接口边界、任务结果可读展示。后台章节定稿自动调度和世界书 ops 应用逻辑保持不变。

## Current Flow

1. 世界书页面调用 `triggerWorldBookAutoUpdate(projectId)`，不传 `chapterId`。
2. 后端 `trigger_worldbook_auto_update` 如果未收到 `chapter_id`，尝试选择最新 `status=done` 章节。
3. 找不到 done 章节时，当前代码仍创建 `chapter_id=null` 的 `worldbook:project:*` 任务。
4. `worldbook_auto_update_v1` 只有在 `chapter_id` 存在时才读取章节摘要和正文；否则 prompt 中章节输入为空。
5. 页面任务区当前将 `result.applied` 以裸 JSON 展示，`no_op=true` 不容易理解。

## Target Flow

1. 世界书页面加载章节 meta，计算最新已完成章节。
2. 自动更新区域显示“将补跑：第 N 章：标题”。
3. 没有已完成章节时禁用或阻止【手动触发】，显示固定提示。
4. 触发时前端显式传入最新已完成章节 ID。
5. 后端接口保留自动选择最新 done 章节的能力，但如果最终没有章节，返回校验错误，不创建项目级任务。
6. 任务完成后，页面用可读摘要展示 applied 计数；`no_op=true` 显示“已完成，未产生世界书变更”。

## Backend Contract

- Endpoint: `POST /api/projects/{project_id}/worldbook_entries/auto_update`
- 输入：
  - `chapter_id` 可选。
  - 若传入，必须存在、属于项目、`status=done`。
  - 若未传入，后端选择最新 `status=done` 章节。
- 新行为：
  - 若最终未选中章节，抛出 validation error，details 建议包含 `reason: "no_done_chapter"`。
  - 不再通过该手动接口创建 `worldbook:project:*` idempotency key。
- 保留：
  - `schedule_worldbook_auto_update_task` 仍支持无 `chapter_id`，避免影响其他可能的系统级调度能力；本轮只收紧手动触发接口。

## Frontend Contract

- 世界书页面复用章节 meta 获取能力，筛选 `status === "done"`。
- 最新已完成章节排序建议与后端一致：优先 `updated_at` 降序，再用稳定字段兜底。若前端为了展示按本地数据选择章节，触发时也显式传该 ID，避免前后端选择不一致。
- 自动更新区新增输入属性：
  - latest done chapter display data
  - no done chapter message/disabled state
- 触发按钮禁用条件新增：没有 latest done chapter。
- 触发函数调用 `triggerWorldBookAutoUpdate(projectId, latestDoneChapter.id)`。

## Task Result Display

- 从 `task.result.applied` 读取：
  - `created`
  - `updated`
  - `deleted`
  - `skipped`
  - `no_op`
- `no_op=true`：
  - 显示“已完成，未产生世界书变更”
  - 显示解释：“模型未提出可应用的新增/合并/更新条目；本次没有修改世界书。”
- `no_op=false`：
  - 显示“已应用：新增 X，更新 Y，删除 Z，跳过 W”
- 失败状态仍使用现有 error_type / error_message 展示。

## Compatibility

- 章节定稿后的自动任务调度通过 `schedule_chapter_done_tasks` 传入章节 ID，不受手动接口 no-done 校验影响。
- 任务中心详情仍可查看原始 result；世界书页面只是改成人类可读摘要。

## Risks

- 前端章节 meta 加载失败时，可能无法判断是否可触发。处理策略：保守禁用触发或显示加载/失败提示，避免创建空跑任务。
- 前后端“最新章节”选择规则若不一致，可能显示 A 章却触发 B 章。MVP 通过前端显式传入所显示章节 ID 规避。
