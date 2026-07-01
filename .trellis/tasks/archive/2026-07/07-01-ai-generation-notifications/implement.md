# AI 生成完成通知实施计划

## Checklist

1. 后端数据模型和迁移
   - 新增 `UserNotificationSettings` 模型并导出。
   - 新增 Alembic migration 创建 `user_notification_settings`。
   - 复用现有 secret 加密/脱敏工具处理 Webhook。

2. 后端 API
   - 新增通知设置 schema。
   - 新增 `/api/me/notification-settings` GET/PUT。
   - 注册路由。
   - 覆盖读取默认值、保存、清除 Webhook、脱敏返回、权限隔离测试。

3. 后端通知服务
   - 新增生成完成事件数据结构。
   - 新增飞书消息构造和发送逻辑，短超时、失败吞掉并写脱敏日志。
   - 在 `write_generation_run` 成功和错误记录后触发通知。
   - 梳理直接写 `GenerationRun` 的服务，补齐通知调用或提取共用封装。

4. 前端 API 和设置页
   - 新增通知设置 API client/types。
   - 新增账号/个人通知设置入口和页面。
   - 支持浏览器权限状态、授权按钮、保存/清除飞书 Webhook。

5. 前端浏览器通知触发
   - 新增统一浏览器通知工具。
   - 在大纲生成、章节生成、润色/分析等生成调用成功/失败路径接入。
   - 保证权限未授予或浏览器不支持时无未捕获异常。

6. 验证
   - 后端：运行相关 pytest，至少覆盖新 API、通知服务、`write_generation_run` 通知触发。
   - 前端：运行 lint/typecheck/test 中可用命令，补充页面/工具单测或最小可验证路径。
   - 手动检查：浏览器通知授权流程、飞书 Webhook 测试发送、成功/失败生成通知。

## Validation Commands

- `cd backend && python -m pytest tests`
- `cd frontend && npm run lint`
- 如前端存在测试脚本，运行 `cd frontend && npm test` 或项目实际脚本。

## Risky Files

- `backend/app/services/run_store.py`: 通用生成记录入口，通知失败必须 fail-soft。
- `backend/app/api/routes/outline.py`、`backend/app/api/routes/chapters.py`: SSE 收尾不能被通知逻辑打断。
- `frontend/src/services/sseClient.ts` 与生成页面状态代码：避免重复通知或漏通知。

## Rollback Points

- 数据库迁移新增表为独立表，回滚影响范围小。
- 后端通知调用集中在服务层，必要时可临时禁用飞书发送。
- 前端浏览器通知工具可通过用户设置默认关闭避免影响主流程。
