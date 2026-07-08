# 后端数据库规范

## 技术栈与运行模式

- ORM：SQLAlchemy 2.x，模型在 `backend/app/models/`。
- 迁移：Alembic，版本目录为 `backend/alembic/versions/`。
- Session：`backend/app/db/session.py` 提供 `engine`、`SessionLocal` 和 FastAPI 依赖 `get_db()`。
- 默认本地数据库：`sqlite:///./ainovel.db`，会被 `Settings` 规范化到 `backend/` 绝对路径。
- Docker Compose 使用 Postgres + pgvector，连接串来自 `DATABASE_URL`。

## 模型约定

模型使用 SQLAlchemy 2.x 类型注解风格：

- 主键通常是 `String(36)`，ID 由 `app.db.utils.new_id()` 生成。
- 时间字段使用 `DateTime(timezone=True)`，默认值来自 `app.db.utils.utc_now`。
- 外键明确 `ondelete`，项目级数据常用 `CASCADE`，可选关联常用 `SET NULL`。
- 索引在模型类之后用 `Index(...)` 声明。

参考：`backend/app/models/project.py`、`backend/app/models/chapter.py`。

## 查询和事务

- API 层通过 `DbDep` 获取 `Session`，不要手动创建新的 session，除非是应用启动、worker 或独立脚本。
- 写入后显式 `db.commit()`，需要返回最新行时使用 `db.refresh(model)`。
- 多表读取使用 `select(...)`，聚合使用 SQLAlchemy 表达式，例如 `case`、`func.count`。
- 批量或分页查询要限制返回量；章节 meta 分页见 `backend/app/api/routes/chapters.py` 和测试 `backend/tests/test_chapters_meta_contract.py`。
- SQLite 模式不能在 LLM 调用期间持有长事务；本地开发只允许 `--workers 1`。
- SQLite 读回 `DateTime(timezone=True)` 时可能得到 offset-naive `datetime`；如果要和 `utc_now()` 这类 offset-aware 值比较，先在比较边界统一规范化（例如去掉 `tzinfo` 或统一转 UTC），否则快速写入/排序逻辑会在测试或本地环境触发 `TypeError`。
- 服务函数如果在同一个写事务里需要判断表是否存在，不要用 `inspect(bind).has_table(...)`；SQLite 测试环境中 inspector 可能干扰当前连接上已 `flush()` 但未 `commit()` 的修改。优先用当前 `Session` 执行普通 SQL，例如 SQLite 查询 `sqlite_master`，Postgres 查询 `to_regclass(:name)`，确保表探测不破坏业务事务。

## 章节派生记忆生命周期

- `StoryMemory.chapter_id` 表示章节派生记忆的来源章节。删除单章、删除大纲下章节、覆盖重建章节前，应先调用共享清理逻辑删除命中这些 `chapter_id` 的 `StoryMemory`，再删除 `Chapter`。
- 不要只依赖 `StoryMemory.chapter_id` 的 `ON DELETE SET NULL`；这会把旧章节伏笔变成无来源 open loop，继续污染伏笔时间线和记忆检索。
- 伏笔时间线接口只展示 `chapter_id IS NOT NULL`、`is_foreshadow=1` 且未回收的 `StoryMemory`；历史或手动创建的项目级 `chapter_id=NULL` 记忆不应默认进入该页面。
- 新增章节删除入口或批量替换入口时，应新增/更新回归测试，断言被删章节的 StoryMemory 已删除，其他章节和项目级记忆不受影响。

## 迁移约定

- 应用启动由 `ensure_db_schema()` 执行 `alembic upgrade head`，见 `backend/app/db/migrations.py`。
- Postgres 迁移使用 advisory lock，避免多 worker 同时迁移。
- legacy SQLite 无 `alembic_version` 时，非生产环境可自动 stamp；`APP_ENV=prod` 禁止自动 stamp。
- 新增/修改模型必须同步 Alembic 迁移，并考虑 SQLite 与 Postgres 的兼容性。

## Docker 数据

- Compose 数据卷：`postgres_data` 保存 Postgres，`app_data` 保存 `/data/chroma` 和 `/data/secrets`。
- 生产 Compose 覆盖 `docker-compose.prod.yml` 会取消 Postgres/Redis 对宿主端口暴露。

## 避免

- 不要在服务函数里隐式吞掉数据库异常；让 `SQLAlchemyError` 进入全局处理器或转换为明确 `AppError`。
- 不要在生产环境依赖 SQLite 多 worker。
- 不要把 API Key 明文、密钥材料或大体积生成内容写入迁移脚本日志。

## Scenario: 结构化记忆关系引用解析

### 1. Scope / Trigger

- Trigger: 修改 `memory_change_sets`、`MemoryRelation`、记忆更新 LLM 契约、章节记忆提议或应用逻辑。
- 目标：关系引用必须在 propose 阶段解析清楚，避免 apply 阶段才触发数据库外键错误。

### 2. Signatures

- API: `POST /api/chapters/{chapter_id}/memory/propose`
- DB: `relations.from_entity_id -> entities.id`
- DB: `relations.to_entity_id -> entities.id`
- Service: `propose_chapter_memory_change_set(...)` 生成 `MemoryChangeSetItem.after_json`

### 3. Contracts

- Relation `after.from_entity_id` / `after.to_entity_id` 只能引用同项目未删除实体。
- 允许引用已有 `entities.id`。
- 允许引用同一变更集内新建 entity 的 `target_id`。
- 允许引用同一变更集内新建 entity 的 `after.name` 精确文本，服务层会归一化为 `target_id`。
- 不允许模型自造拼音、英文缩写、slug 或其他无法解析的符号 ID。
- Prompt preset `memory_update_v1` 必须把上述引用规则写进契约，但服务层仍必须强校验。

### 4. Validation & Error Matrix

- Relation 引用可解析 -> 保存 change_set，`after_json` 中写入解析后的实体 ID。
- Relation 引用不可解析 -> `VALIDATION_ERROR`，`details.reason=unresolved_relation_entity_ref`。
- 任一 relation 引用不可解析 -> 拒绝整个 change_set，不创建可 apply 的部分结果。

### 5. Good/Base/Bad Cases

- Good: 同一 ops 先 upsert entity `target_id=e_yuriko`，后续 relation 使用 `from_entity_id=e_yuriko`。
- Base: 同一 ops 先 upsert entity `name=百合子`，后续 relation 使用 `from_entity_id=百合子`，服务层解析为 `e_yuriko`。
- Bad: 新建 entity `name=百合子`，relation 使用 `from_entity_id=yuriko`，服务层应拒绝整个变更集。

### 6. Tests Required

- 测试同一变更集内 relation 用 entity name 可解析并可 apply。
- 测试 relation 引用不可解析时 propose 返回 `VALIDATION_ERROR`，且不创建 `MemoryChangeSet` 或实体行。
- 测试已有实体 ID 仍可作为 relation 引用。

### 7. Wrong vs Correct

#### Wrong

```json
{"target_table":"relations","after":{"from_entity_id":"yuriko","to_entity_id":"pan_yue"}}
```

#### Correct

```json
{"target_table":"relations","after":{"from_entity_id":"e_yuriko","to_entity_id":"pan_yue"}}
```

## Scenario: 章节记忆提议的章节归属校验

### 1. Scope / Trigger

- Trigger: 修改章节级 `memory_update_v1` 提议、应用、前端记忆更新抽屉、LLM 自动提议结果转换逻辑。
- 目标：章节级提议不能把上一章或其他章节的结构化记忆条目套用到当前章节。

### 2. Signatures

- API: `POST /api/chapters/{chapter_id}/memory/propose`
- Service: `propose_chapter_memory_change_set(...)`
- Tables: `events`、`foreshadows`、`evidence`
- UI: `MemoryUpdateDrawer` 重新提交已接受条目时会把 `MemoryChangeSetItem.after_json` 转回 ops。

### 3. Contracts

- `events.chapter_id` 为空时由服务层填充为路径 `chapter_id`；非空时必须等于路径 `chapter_id`。
- `foreshadows.chapter_id` 和 `foreshadows.resolved_at_chapter_id` 为空时允许；非空时必须等于路径 `chapter_id`。
- `evidence.source_type=chapter` 且 `source_id` 非空时，`source_id` 必须等于路径 `chapter_id`。
- 通用实体、关系或无章节来源的 evidence 不应因为缺少章节 ID 被拒绝。
- 前端章节切换或关闭重开到不同章节时，必须清空并失效旧 `proposeResult` / accepted / apply 状态；异步晚到的旧章节 propose/apply 响应不能写入当前章节 UI。

### 4. Validation & Error Matrix

- 条目章节归属匹配 -> 保存 proposed change_set。
- 条目绑定其他章节 -> `VALIDATION_ERROR`，`details.reason=memory_update_item_chapter_mismatch`。
- 任一条目不匹配 -> 拒绝整个 change_set，不创建可应用的部分结果。

### 5. Good/Base/Bad Cases

- Good: 对章节 `c2` 提交 event `after.chapter_id=c2`。
- Base: 对章节 `c2` 提交 event 省略 `chapter_id`，服务层自动补为 `c2`。
- Bad: 对章节 `c2` 提交 event `after.chapter_id=c1` 或 evidence `source_type=chapter, source_id=c1`，服务层应拒绝。

### 6. Tests Required

- 测试章节级 propose 拒绝绑定其他章节的 event/evidence/foreshadow 条目。
- 测试绑定目标章节的 event/evidence 仍可 propose 成功。
- 前端状态 helper 或组件测试覆盖章节切换后旧提议不可继续应用；存在异步请求时，旧章节晚到响应不能污染新章节会话。

## Scenario: 登录用户名与稳定用户 ID 分离

### 1. Scope / Trigger

- Trigger: 认证、用户管理、Linux.do OIDC 或用户表迁移相关改动。
- 目标：`users.id` 是稳定内部用户 ID 和外键目标；本地可登录、可修改的用户名存储在 `users.login_name`。

### 2. Signatures

- DB: `users.id: String(64) primary key`，`users.login_name: String(64) unique not null`。
- API: `POST /api/auth/local/login` 请求 `{ login_name, password }`。
- API: `POST /api/auth/local/register` 请求 `{ login_name, password, display_name?, email? }`。
- API: `POST /api/auth/admin/users` 请求 `{ login_name, display_name?, email?, is_admin?, password? }`。
- API: 用户响应对象必须同时返回稳定 `id` 和 `login_name`。

### 3. Contracts

- `login_name` 由后端统一 `trim + lower` 归一化。
- `login_name` 只允许 `a-z`、`0-9`、`_`、`-`，长度 1 到 64。
- 新建本地用户时 `users.id` 由系统生成，不能直接等于或依赖 `login_name`。
- 历史用户迁移只回填 `login_name`，不得修改历史 `users.id`。
- Linux.do OIDC 通过 `auth_external_accounts.user_id -> users.id` 绑定稳定账号；修改 `login_name` 不应影响外部账号登录。

### 4. Validation & Error Matrix

- 缺少 `login_name` 或提交旧 `user_id` 登录名字段 -> `VALIDATION_ERROR`。
- `login_name` 为空、超长或包含非法字符 -> `VALIDATION_ERROR`。
- 归一化后的 `login_name` 已存在 -> `CONFLICT`。
- 普通注册使用超级管理员登录名（默认 `admin`） -> `FORBIDDEN`。
- 禁用、改登录名或撤销超级管理员管理员权限 -> `FORBIDDEN`。
- 管理员撤销自己的管理员权限 -> `FORBIDDEN`。

### 5. Good/Base/Bad Cases

- Good: 用户管理页修改 `login_name` 后，旧登录名不能再登录，新登录名可以登录，`users.id` 不变。
- Base: 现有用户迁移后仍能用原用户名登录，因为 `login_name` 初始回填为历史 `users.id` 的规范化值。
- Bad: 直接修改 `users.id` 来实现改用户名，会破坏外键、会话和 Linux.do 外部账号绑定。

### 6. Tests Required

- 认证测试断言 `login_name` 登录/注册成功，旧 `user_id` 登录名入参被拒绝。
- 管理员测试断言可修改 `login_name/display_name/email`，旧登录名失效，新登录名生效。
- 管理员权限测试断言不能撤销自己，不能禁用/改名/降权超级管理员。
- OIDC 测试断言修改 `login_name` 后再次 Linux.do 登录仍进入同一 `users.id`，不创建重复用户。
- 迁移测试断言历史用户回填 `login_name`、唯一索引存在、冲突历史 ID 有确定性兜底。

### 7. Wrong vs Correct

#### Wrong

```python
user = db.get(User, body.user_id)
session = build_session(user_id=user.id)
```

#### Correct

```python
login_name = validate_login_name(body.login_name)
user = get_user_by_login_name(db, login_name)
session = build_session(user_id=user.id)
```
