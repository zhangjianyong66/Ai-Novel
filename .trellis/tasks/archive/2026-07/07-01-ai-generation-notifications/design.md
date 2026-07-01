# AI 生成完成通知设计

## Architecture

采用用户级通知设置 + 统一通知服务。

- 后端新增 `UserNotificationSettings` 模型，使用 `user_id` 作为主键。
- 后端新增 `/api/me/notification-settings` 的 GET/PUT 接口，当前登录用户只能读写自己的设置。
- 飞书 Webhook URL 使用现有 `app.core.secrets.encrypt_secret` / `decrypt_secret` 加密存储，接口只返回 `feishu_webhook_configured` 和脱敏值。
- 后端新增 `generation_notification_service`，接收生成完成事件，按用户设置发送飞书通知。
- 前端新增账号/个人通知设置页或入口，保存用户通知配置，并处理浏览器通知授权。
- 前端新增轻量 `browserGenerationNotifications` 工具，在生成请求/SSE 收到成功或失败结束事件后触发浏览器 Notification API。

## Data Model

新增表 `user_notification_settings`：

- `user_id`: FK `users.id`, PK。
- `browser_enabled`: boolean, default false。
- `feishu_enabled`: boolean, default false。
- `feishu_webhook_ciphertext`: text, nullable。
- `feishu_webhook_masked`: string, nullable。
- `created_at`, `updated_at`。

默认无记录等价于所有通知关闭。

## Backend Flow

1. 生成任务结束时形成 `GenerationNotificationEvent`：
   - `actor_user_id`
   - `project_id`
   - `chapter_id`
   - `generation_run_id`
   - `task_type`
   - `status`: `success` / `failed`
   - `title` / `summary` / `error_message`
   - `request_id`
2. 调用 `notify_generation_finished(db, event)`。
3. 服务读取当前用户通知设置。
4. 飞书开启且 Webhook 可解密时，用短超时 HTTP POST 飞书消息。
5. 发送异常被捕获并记录脱敏日志，不向上抛出。

优先接入统一入口：

- `backend/app/services/run_store.py::write_generation_run` 负责大纲、章节、MCP research、通用 generation service 等已接入链路。
- 对直接写 `GenerationRun` 的服务做最小补点或后续改为共用通知服务，覆盖润色分析、记忆更新、表格 AI 更新等当前直写路径。
- 批量生成每个 item 已产生 generation run 时可触发单条通知；如噪音过大，后续再加批量聚合，本任务先保证“所有 AI 生成结束都覆盖”。

## Frontend Flow

1. 新增用户通知设置 API client。
2. 新增账号/个人通知设置入口：
   - 浏览器通知开关。
   - 浏览器权限状态与授权按钮。
   - 飞书通知开关。
   - 飞书 Webhook 输入、保存、清除。
3. 生成相关前端调用在确认成功或失败结束时调用统一浏览器通知工具。
4. 浏览器通知仅依赖前端当前会话；页面关闭时不保证触达。

## Message Shape

飞书消息采用 text 或 post 格式的简洁内容：

- 标题：`AI 生成成功` / `AI 生成失败`
- 任务：`outline_generate` / `chapter_generate` / 其他 type
- 项目、章节：有则展示
- 时间、request_id 或 generation_run_id
- 失败摘要：截断到安全长度

浏览器通知同样只展示短标题和短摘要。

## Trade-offs

- 选择用户级独立设置，符合用户明确要求，也避免污染项目设置。
- Webhook 后端触发能覆盖后台和批量任务；浏览器通知前端触发受浏览器在线状态限制，但实现简单且符合“浏览器通知”的产品意图。
- 先不做通知投递记录表，降低复杂度；飞书失败通过日志观测。若后续需要审计或重试，再加投递记录与队列。

## Compatibility and Rollback

- 默认关闭，迁移后不会改变现有用户行为。
- 飞书发送失败不影响生成结果。
- 回滚可删除前端入口和通知调用；数据库新增表不影响旧代码运行。
