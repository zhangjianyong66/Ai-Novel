# 用户管理支持管理员设置与用户名修改 - 实施计划

## 执行顺序

1. 数据模型与迁移
   - 在 `backend/app/models/user.py` 增加 `login_name`。
   - 新增 Alembic migration：添加字段、回填历史用户、创建唯一约束。
   - 更新迁移测试覆盖旧 schema 到新 schema 的回填与幂等升级。

2. 后端认证与用户管理
   - 增加登录名规范化/校验 helper。
   - 修改本地登录、本地注册、管理员创建用户请求模型为 `login_name`。
   - 修改用户公开响应 `_user_public` / `_user_admin_public` 返回 `login_name`。
   - Linux.do OIDC 创建用户时设置初始 `login_name`。
   - 增加管理员基础资料更新接口。
   - 增加管理员权限变更接口。
   - 给禁用接口补超级管理员保护。

3. 前端认证表单
   - 修改 `AuthContext` 登录/注册 payload 为 `login_name`。
   - 修改登录/注册页文案和表单字段命名。
   - 更新 auth 类型，用户对象包含 `loginName`。

4. 前端用户管理
   - `AdminUsersPage` 类型增加 `login_name`。
   - 创建用户表单改为登录用户名。
   - 用户列表突出展示登录用户名，弱化内部 ID。
   - 增加基础资料编辑交互。
   - 增加设为管理员/撤销管理员操作，并处理超级管理员和当前用户保护。

5. 测试与验证
   - 后端认证测试：新 `login_name` 登录/注册、旧 `user_id` 拒绝、旧用户迁移后可登录。
   - 后端 Linux.do 测试：初始 `login_name`、改名后 OIDC 仍进入原用户。
   - 后端管理员测试：编辑资料、权限变更、自撤销拒绝、超级管理员保护。
   - 前端 lint 和相关单测。

## 验证命令

- 后端重点测试：
  - `cd backend && .venv/bin/python -m unittest tests.test_auth_session`
  - `cd backend && .venv/bin/python -m unittest tests.test_linuxdo_oidc_endpoints`
  - `cd backend && .venv/bin/python -m unittest tests.test_admin_user_stats`
  - 新增迁移测试对应模块。
- 前端：
  - `cd frontend && npm run lint`

## 风险点

- API 请求字段从 `user_id` 改为 `login_name` 是破坏性调整，前后端必须同次提交。
- 迁移回填必须保证历史用户仍可登录。
- `admin` 超级管理员保护必须后端兜底，不能只依赖前端禁用按钮。
- 测试中手写 users 表的用例可能需要补 `login_name` 字段。

## 回滚点

- 如果迁移前发现历史 `users.id` 存在大量不符合登录名规范的数据，应先暂停实现并重新规划历史用户名回填策略。
- 如果前端存在外部未纳入仓库的调用方依赖 `user_id` 登录名入参，应单独评估兼容层，而不是混入本次实现。
