# 任务中心规范

## Project Task 类型显示

- Project Task 的 `kind` 是后端任务码值，例如 `search_rebuild`、`worldbook_auto_update`、`graph_auto_update`。
- 任务中心列表和详情应优先显示中文标签，同时保留原始码值，便于用户理解和开发者排障。
- 翻译入口统一放在 `frontend/src/pages/taskCenter/taskCenterModels.ts` 的模型/helper 层；组件只调用 helper，不在 JSX 中散落映射。
- 未知 `kind` 必须原样显示码值，不能显示空白或“未知任务”，避免新任务类型上线后丢失排障信息。

### Tests Required

- `taskCenterModels.test.ts` 覆盖已知 Project Task kind 的中文标签。
- 测试未知 kind 原样返回。
