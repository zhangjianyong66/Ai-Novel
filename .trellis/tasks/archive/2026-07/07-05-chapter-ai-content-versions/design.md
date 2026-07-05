# 章节 AI 生成与优化历史版本设计

## Architecture

新增章节正文版本作为章节内容的历史层：

- `chapters.content_md` 继续表示当前激活正文，兼容既有读取方。
- `chapters.active_version_id` 指向当前激活版本。
- `chapter_versions` 保存每次 AI 生成/优化得到的完整正文，以及必要元数据。
- 后端服务函数统一完成“必要时创建 AI 前快照 -> 创建新版本 -> 激活 -> 同步章节正文 -> 标记 dirty”。

## Data Model

`chapter_versions` 建议字段：

- `id`: string(36) 主键。
- `chapter_id`: 外键到 `chapters.id`，`ondelete=CASCADE`。
- `project_id`: 冗余项目 ID，便于权限、查询和未来项目包扩展。
- `content_md`: 完整章节正文。
- `source`: `ai_generate`、`ai_optimize`、`manual_snapshot`。
- `word_count`: 简单字数统计，用于列表展示。
- `generation_run_id`: 可空。
- `model`: 可空。
- `provider`: 可空。
- `meta`: JSON，可空，保留任务类型、优化模式等低频元数据。
- `created_at`: UTC 时间。

`chapters` 新增：

- `active_version_id`: 可空外键到 `chapter_versions.id`，`ondelete=SET NULL`。

为了避免循环外键导致建表/删表问题，迁移需显式处理 SQLite 和 Postgres 兼容性。

## Backend Contracts

新增 API：

- `GET /api/chapters/{chapter_id}/versions`
  - 读取权限。
  - 返回版本摘要列表和 `active_version_id`。
- `GET /api/chapters/{chapter_id}/versions/{version_id}`
  - 读取权限。
  - 返回完整正文和元数据。
- `POST /api/chapters/{chapter_id}/versions/{version_id}/activate`
  - 修改权限。
  - `done` 章节返回 `AppError.validation(details={"reason": "chapter_done_readonly"})` 或更具体的稳定 reason。
  - 成功后更新 `chapters.content_md`、`chapters.active_version_id`、dirty 状态并返回章节和 active version 摘要。

既有 AI 接口兼容扩展：

- `POST /api/chapters/{chapter_id}/generate`
- `POST /api/chapters/{chapter_id}/generate-stream`
- 章节优化/改写相关接口

这些接口保留既有正文结果字段，同时新增：

- `saved_version`: 本次新建版本摘要。
- `active_version`: 当前激活版本摘要。

## Data Flow

非流式 AI 生成/优化：

1. 路由完成权限检查、prompt 构建和 LLM 调用。
2. 解析得到最终完整正文。
3. 调用统一版本服务创建并激活 AI 版本。
4. 提交事务。
5. 返回既有结果字段和版本摘要。

流式 AI 生成：

1. 后端持续向前端发送进度和 token。
2. 后端聚合完整正文。
3. 最终结果可用后先创建并激活版本。
4. 再发送包含 `saved_version` 的最终事件。

前端写作页：

1. 加载章节详情时读取当前 active version 摘要。
2. 打开版本历史时加载列表。
3. 选中版本后加载完整内容预览。
4. 用户点击激活时，先检查未保存修改和章节状态，再调用激活 API。
5. 激活成功后刷新编辑器正文、表单基线和当前版本摘要。

## Compatibility

- `chapters.content_md` 继续是主读路径，避免改动导出、RAG、搜索、章节分析等大量既有代码。
- 旧章节 `active_version_id` 允许为空，第一次 AI 操作时懒创建快照。
- AI 接口响应保留旧字段，前端逐步切换到版本语义。
- 不自动创建后台 ProjectTask，遵守既有普通保存边界。

## Risks

- `chapters.active_version_id` 和 `chapter_versions.chapter_id` 是循环引用，迁移和 ORM relationship 要谨慎。
- AI 调用期间不能长时间持有写事务；版本服务应在最终结果出现后短事务写入。
- 前端如果仍保留旧“确认保存”入口，可能造成用户误解，需要文案和流程收敛。
- 并发 AI 调用采用最后完成者为当前版本，所有结果保留在历史中。

## Rollback

- 数据库迁移可通过删除 `active_version_id` 和 `chapter_versions` 回滚。
- 如果前端版本 UI 有问题，后端即时保存仍能保证刷新后通过章节正文找回最新结果。
