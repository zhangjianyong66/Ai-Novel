# 用户管理支持管理员设置与用户名修改 - 技术设计

## 边界

本任务把“登录用户名”从内部用户 ID 中拆出来：

- `users.id`：稳定内部用户 ID，继续作为外键目标和会话中的用户标识。
- `users.login_name`：唯一、可修改的本地登录用户名。
- `users.display_name`：展示名，不参与登录。

本任务不引入全局会话吊销机制，不修改 Linux.do 外部账号的 `subject` 绑定模型。

## 数据模型与迁移

- 在 `User` 模型新增 `login_name: String(64), unique=True, nullable=False`。
- Alembic 迁移步骤：
  - 给 `users` 添加可空 `login_name`。
  - 将历史行回填为规范化后的 `users.id`。
  - 对可能不符合新规则的历史 ID，迁移需保持可登录。优先按既有 `id` 原样小写/规范化写入；如果存在冲突或非法字符，需要采用确定性兜底并在测试覆盖。
  - 设置非空和唯一约束/唯一索引。
- 新建本地用户时，`users.id` 使用 `new_id()` 生成；`login_name` 使用请求中的登录用户名规范化结果。
- Linux.do OIDC 首次登录仍可生成内部 `users.id`，同时设置初始 `login_name`。后续如果管理员修改 `login_name`，`auth_external_accounts.user_id` 仍指向稳定 `users.id`。

## 登录名规范

- 输入 trim 后转小写。
- 只允许 `a-z`、`0-9`、`_`、`-`。
- 长度 1 到 64。
- 按规范化后的值做唯一性检查。

后端是权威校验点；前端做同等预检以减少无效提交。

## API 合约

- `POST /api/auth/local/login`
  - 请求字段改为 `login_name` 和 `password`。
  - 后端按 `User.login_name == normalized(login_name)` 查找用户，再用 `UserPassword.user_id == user.id` 校验密码。
  - 缺少 `login_name`、仅提交旧 `user_id` 时请求失败。
- `POST /api/auth/local/register`
  - 请求字段改为 `login_name`、`password`、`display_name`、`email`。
  - 创建用户时生成稳定内部 `id`。
  - `login_name=admin` 应视为系统保留名并拒绝普通注册。
- `GET /api/auth/user`
  - 响应用户对象保留 `id`，新增 `login_name`。
- `GET /api/auth/admin/users`
  - 响应每个用户保留 `id`，新增 `login_name`。
  - 搜索应覆盖 `login_name`、`id`、`display_name`、`email`。
  - 分页 cursor 继续基于稳定 `id`，避免登录名修改影响分页。
- `POST /api/auth/admin/users`
  - 请求字段改为 `login_name`、`display_name`、`email`、`is_admin`、`password`。
  - 创建用户时生成稳定内部 `id`。
- 新增管理员基础资料更新接口，建议 `PATCH /api/auth/admin/users/{target_user_id}`：
  - 支持 `login_name`、`display_name`、`email`。
  - `target_user_id` 是稳定内部 `id`。
  - `admin` 超级管理员不允许修改 `login_name`。
- 新增或扩展管理员权限接口，建议 `POST /api/auth/admin/users/{target_user_id}/admin`：
  - 请求 `{ "is_admin": boolean }`。
  - 不允许撤销当前管理员自己的管理员权限。
  - 不允许撤销超级管理员 `admin` 的管理员权限。
- 现有禁用接口保持语义，但需保护超级管理员 `admin` 不可禁用。

## 超级管理员判定

超级管理员默认按 `settings.auth_admin_user_id` 判断，通常为 `admin`。判断时应对比稳定内部 `users.id` 或迁移后的超级管理员记录。

因为新建用户的内部 ID 不再等于登录名，系统初始化的管理员用户需要：

- 内部 `id = settings.auth_admin_user_id`，保持固定超级管理员入口。
- `login_name = settings.auth_admin_user_id`。

## 前端设计

- 登录页和注册页字段名、提交 payload 改为 `login_name`。
- 用户管理页：
  - 列表主字段展示“登录用户名”。
  - 内部 ID 作为辅助排障信息弱化展示。
  - 支持编辑基础资料：登录用户名、显示名、邮箱。
  - 支持危险操作：设为管理员/撤销管理员、启用/禁用、重置密码。
  - 危险操作二次确认；后端拒绝时展示错误。
  - 对超级管理员禁用不可用操作或展示受保护状态；后端仍必须兜底。

## 兼容性与风险

- 这是破坏性 API 调整：旧 `user_id` 登录名入参不兼容。
- 现有用户迁移后仍可使用原用户名登录，因为 `login_name` 初始等于历史 `users.id`。
- 修改登录名不会踢出现有会话；管理员权限以后端每次查询为准。
- 需要注意测试中手动 `CREATE TABLE users` 的精简表可能因新增非空字段失败，必要时补测试表字段或改用 ORM 建表。
