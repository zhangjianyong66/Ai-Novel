# 持久化章节分析结果设计

## Scope

本次改动覆盖后端数据模型/迁移、章节分析 API、剧情记忆应用服务，以及写作页章节分析弹窗恢复和操作状态。

## Data Model

复用 `plot_analysis` 作为“每章最近一次成功分析”的权威表，保留 `chapter_id` 唯一约束。

新增字段：

- `generation_run_id`：最近一次成功 `chapter_analyze` 或 `plot_auto_update` 的 LLM 运行 ID。
- `chapter_content_hash`：分析所基于的已保存 `chapter.content_md` hash。
- `chapter_active_version_id`：分析所基于的章节激活版本 ID，可为空以兼容旧数据。
- `apply_status`：`pending`、`success`、`empty`、`failed`。
- `apply_error_json`：自动应用失败时的结构化错误，成功或空结果时清空。
- `updated_at`：最近一次分析记录更新时间。

旧数据兼容：

- 既有 `plot_analysis` 行缺少 hash/version 时视为 `stale` 或 `unknown`，不阻止展示，但不允许危险操作。
- SQLite/PostgreSQL 迁移均需添加 nullable/default-safe 字段。

## Backend Contracts

### `POST /api/chapters/{chapter_id}/analyze`

- 拒绝 `draft_title`、`draft_plan`、`draft_summary`、`draft_content_md` 非空请求。
- 使用数据库中已保存章节内容渲染 prompt。
- LLM 解析失败时只返回当次失败，不更新 `plot_analysis`。
- LLM 解析成功时保存/更新 `plot_analysis`，记录 hash、active version、generation run。
- 保存后立即调用应用逻辑更新剧情记忆。
- 响应包含：
  - 原有 `analysis`、`generation_run_id`、warnings 等。
  - `persisted_analysis` 或等价元数据：`plot_analysis_id`、`is_stale`、`analyzed_content_hash`、`chapter_active_version_id`。
  - `apply_result`：`status`、`memories_count`、可选 `error`。

### `GET /api/chapters/{chapter_id}/analysis`

- 返回该章最近一次持久化分析结果。
- 无记录返回 `analysis: null` 或 404 风格的空数据，前端按无历史处理。
- 根据当前章节保存内容 hash/active version 计算 `is_stale`。
- 返回 `apply_status`、`apply_error`、`generation_run_id`、`updated_at`。

### `POST /api/chapters/{chapter_id}/analysis/retry_apply`

- 读取最近一次持久化分析。
- 若记录过期则拒绝，要求重新分析。
- 若记录有效，重新调用应用逻辑。
- 返回新的 `apply_result` 和记忆数量。

## Service Behavior

- `apply_chapter_analysis` 不再把 0 条 seeds 当内部错误；应提交 `PlotAnalysis` 并返回 `memories: []`，状态由调用方标为 `empty`。
- 自动应用失败不能回滚已保存的分析结果；分析保存和应用状态更新需要分阶段处理，失败只写 `apply_status=failed` 和 `apply_error_json`。
- 重新分析覆盖同章托管剧情记忆，保留非托管/手动记忆，沿用当前 `_MANAGED_MEMORY_TYPES` 策略。

## Frontend Behavior

- 打开章节分析弹窗时按需加载最近持久化分析。
- 当前章节切换时清空内存状态，重新打开时从后端恢复。
- 有未保存修改时禁用“开始分析”按钮，并显示简短原因。
- 成功分析后更新弹窗为持久化结果，并展示自动应用状态。
- 保留常驻“保存到记忆库”按钮，调用持久化分析的重新应用接口，供用户恢复或重复写入钩子、伏笔、情节点到剧情记忆。
- 自动应用失败时显示失败状态和“重试应用”入口；过期分析禁用保存/重试应用按钮。
- 过期分析可查看，但“按建议重写”禁用。

## Compatibility And Rollback

- 新增字段均允许旧数据存在；前端要处理缺少 hash/version 的记录。
- 若迁移后需要回滚，删除新增列即可恢复旧表形态；代码层需回退对应 API 和 UI。
- 项目包导出当前明确不包含 `plot_analysis`，本次不改变导入导出协议。
