# 大纲生成基调节奏快捷选择设计

## Scope

本任务改动前端大纲生成弹窗、后端偏好历史 API 和数据库结构。提示词模板、生成结果解析、大纲保存逻辑保持不变。

## UI Design

- “基调”和“节奏”继续使用可输入控件，改为 `<input list="...">` + `<datalist>`。
- 内置示例和后端返回的用户历史项都作为候选项出现。
- 用户可以直接输入不在候选中的任意内容。
- 候选列表不额外增加管理按钮，避免扩大范围。

## Data Model

- 在 `outlineModels.ts` 中集中维护内置候选：
  - `DEFAULT_OUTLINE_TONE_OPTIONS`
  - `DEFAULT_OUTLINE_PACING_OPTIONS`
- 在 `outlineModels.ts` 中提供前端纯函数：
  - 合并内置项与历史项并去重。
  - trim 空白、过滤空值。

后端新增模型，建议命名为 `ProjectOutlineGenerationPreference`：

- `id`: string 主键。
- `project_id`: 外键到 `projects.id`，级联删除。
- `user_id`: 外键到 `users.id`，级联删除。
- `field`: `tone` 或 `pacing`。
- `value`: 候选文本。
- `use_count`: 使用次数。
- `created_at` / `updated_at`: 时间戳。
- 唯一约束：`project_id + user_id + field + value`。
- 索引：`project_id + user_id + field + updated_at`。

## Persistence

- 使用后端数据库保存用户历史，避免浏览器数据丢失。
- 前端不再依赖 localStorage 作为主要存储。
- 后端保存时负责去重、更新时间、累计使用次数，并按每个字段限制最近 N 条。
- 推荐默认每个字段保留 20 条用户历史；内置示例不计入这个上限。

## API Design

新增项目级偏好接口，建议放在 `backend/app/api/routes/outlines.py` 或单独路由文件：

- `GET /api/projects/{project_id}/outline/generation-preferences`
  - 权限：项目 viewer。
  - 返回：`{ tone: string[], pacing: string[] }`。
- `POST /api/projects/{project_id}/outline/generation-preferences`
  - 权限：项目 editor。
  - 请求：`{ tone?: string, pacing?: string }`。
  - 行为：保存非空字段，去重更新，裁剪每字段上限。
  - 返回：更新后的 `{ tone: string[], pacing: string[] }`。

## Data Flow

1. `useOutlineGenerationState` 在项目 id 可用时请求后端历史候选。
2. 弹窗渲染时把内置项和后端历史项合并后传给 `OutlineGenerationModal`。
3. 用户输入或选择候选后，继续更新 `genForm.tone` / `genForm.pacing`。
4. 用户点击生成时，在调用大纲生成 API 前或同时调用偏好保存 API 记录本次非空输入。
5. 生成请求继续使用当前 `genForm` 值。
6. 保存偏好失败不阻断生成；生成成功或保存成功后刷新本地候选状态。

## Error Handling

- GET 历史失败：前端继续显示内置候选，并允许正常生成。
- POST 历史失败：不阻断生成请求，避免偏好保存影响核心功能。
- 后端对超长 value 做长度限制，避免异常大文本进入偏好表。

## Compatibility

- 现有默认 `tone` / `pacing` 不变。
- 现有大纲生成 payload 不变。
- 现有大纲生成接口不需要改变请求结构。
- 数据库迁移新增表，不影响已有数据。
