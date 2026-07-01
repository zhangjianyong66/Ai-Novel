# 大纲生成基调节奏快捷选择执行计划

## Checklist

- [x] 读取前端和后端规范、相关指南。
- [x] 新增后端模型 `ProjectOutlineGenerationPreference` 并加入模型导出。
- [x] 新增 Alembic 迁移创建偏好历史表、唯一约束和索引。
- [x] 新增 schema 定义偏好读取/保存请求与响应。
- [x] 新增后端服务或路由辅助函数，实现 trim、去重、使用次数更新、每字段上限裁剪。
- [x] 新增后端 API：读取项目大纲生成偏好候选。
- [x] 新增后端 API：保存本次生成使用的基调/节奏偏好。
- [x] 增加后端测试覆盖权限、保存、去重、上限裁剪。
- [x] 在 `outlineModels.ts` 增加内置候选、候选合并辅助函数和测试。
- [x] 在 `useOutlineGenerationState.ts` 从后端加载、保存和暴露候选项。
- [x] 在 `OutlinePageSections.tsx` 将基调/节奏输入改为 datalist 候选。
- [x] 运行前后端相关测试。

## Validation

- `cd backend && pytest tests/<新增或相关测试文件>`
- `cd frontend && npm test -- src/pages/outline/outlineModels.test.ts`
- 如有类型或 lint 风险，再运行 `cd frontend && npm run lint`。

## Rollback Points

- 若 datalist 交互不符合预期，可回退 `OutlinePageSections.tsx` 为普通 input，保留后端接口不接入 UI。
- 若偏好保存影响生成，可先移除前端保存调用，保留静态候选和后端 API。
