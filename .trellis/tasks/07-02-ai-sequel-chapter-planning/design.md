# AI 生成用户指令历史与默认选项设计

## Architecture

本功能复用大纲生成偏好的项目+用户维度历史模式，但独立建模，避免把章节生成指令塞进大纲的 `tone/pacing` 语义里。

后端新增：

- 模型：`ProjectChapterGenerationInstructionPreference`
- 服务：`chapter_generation_instruction_preferences.py`
- Schema：保存请求与返回结构
- 路由：挂到 `backend/app/api/routes/chapters.py`
- Alembic 迁移：从当前 head `5d6c1e7a2b4f` 新增表

前端新增：

- 默认指令常量与合并去重函数，建议放在写作生成模型/工具文件中。
- `useChapterGeneration` 拉取和保存历史，只在单章 `generate("replace" | "append")` 中调用保存。
- `AiGenerateDrawer` 在 textarea 附近增加紧凑的选项控件，选择后写入 `genForm.instruction`，保留 textarea 自由编辑。

## Data Model

新增表建议命名：

- `project_chapter_generation_instruction_preferences`

字段：

- `id`: string(36), primary key
- `project_id`: string(36), FK `projects.id`, cascade delete
- `user_id`: string(64), FK `users.id`, cascade delete
- `value`: string, 建议 4000 长度，与 `ChapterGenerateRequest.instruction` 的 max_length 对齐
- `use_count`: int, default 1
- `created_at`: timezone datetime
- `updated_at`: timezone datetime

约束与索引：

- unique: `(project_id, user_id, value)`
- lookup index: `(project_id, user_id, updated_at)`

## API Contract

新增接口：

- `GET /api/projects/{project_id}/chapter-generation-instruction-preferences`
  - 权限：`require_project_viewer`
  - 返回：`{"preferences": {"instructions": string[]}}`

- `POST /api/projects/{project_id}/chapter-generation-instruction-preferences`
  - 权限：`require_project_editor`
  - 请求：`{"instruction": string}`
  - 行为：trim、空值不保存、重复值更新 `use_count` 和 `updated_at`
  - 返回：`{"preferences": {"instructions": string[]}}`

历史列表按最近使用倒序返回，并限制保留最近 20 条。

## Frontend Flow

加载：

1. `useChapterGeneration` 在 `projectId` 变化时请求历史接口。
2. 请求失败时历史置空，不阻断页面。
3. 默认指令与历史指令合并，历史优先、默认补齐、去重。

选择：

1. `AiGenerateDrawer` 展示一个 `select`，默认占位为“套用用户指令...”。
2. 用户选择某项后，将该文本写入 `genForm.instruction`。
3. textarea 继续作为最终可编辑内容来源。

保存：

1. 单章生成 `generate("replace")` 和追加生成 `generate("append")` 进入请求流程后，调用保存历史。
2. 仅保存 `genForm.instruction.trim()` 非空值。
3. 保存失败 catch 并静默忽略，不影响生成。
4. 保存成功后刷新本地历史 state，使选项立即更新。

## Compatibility

- 不改变现有章节生成请求 payload。
- 不改变批量生成逻辑。
- 不迁移旧 localStorage，因为之前没有用户指令历史。
- 默认指令在前端实现，后端只存用户历史。

## Trade-Offs

- 后端持久化比 localStorage 多一次接口和迁移，但能满足项目+用户隔离，也与既有大纲偏好保持一致。
- `select + textarea` 比单个输入更占空间，但 textarea 原生不支持 datalist，能保留多行编辑体验。
- 暂不做历史管理能力，避免把本轮聚焦的复用能力扩大成完整 preset 管理。
