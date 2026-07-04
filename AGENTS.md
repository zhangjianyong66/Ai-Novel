# 项目协作说明

## 目录结构

- `backend/`：FastAPI 后端，测试位于 `backend/tests/`。
- `frontend/`：React + Vite + TypeScript 前端。
- `tools/`：本地开发与运维辅助脚本。
- `docs/superpowers/plans/`：跨会话延续的 Superpowers 计划文件，适合记录后续逐项分析或执行的任务清单。
- `.trellis/`：Trellis 工作流、任务和项目规范。

## Docker 运行约定

- 推荐使用 `./tools/docker-up.sh` 管理 Docker Compose 启动、构建、日志和停止。
- `tools/docker-up.sh` 优先使用 Docker Compose v2 插件命令 `docker compose`。
- 如果本机没有 v2 插件但安装了独立命令 `docker-compose`，脚本会自动回退使用 `docker-compose`。
- `.env.docker` 不存在时，脚本会从 `.env.docker.example` 自动复制一份。
- 如果启动时报 `failed to bind host port 127.0.0.1:6379`，说明宿主机 Redis 端口已被占用；可在 `.env.docker` 中把 `REDIS_PORT` 改为未占用端口（例如 `6380`）。容器内后端和 worker 仍通过 `redis://redis:6379/0` 通信，不受宿主机映射端口影响。

## Docker 数据存储约定

- Docker Compose 默认把 PostgreSQL 数据库持久化到命名卷 `postgres_data`，容器内路径为 `/var/lib/postgresql/data`；项目、章节、大纲、角色、世界书、术语、知识库元数据、任务记录、用户、LLM 配置等业务表都在该数据库中。
- 后端和 worker 共享命名卷 `app_data`，容器内挂载到 `/data`；默认 `VECTOR_CHROMA_PERSIST_DIR=/data/chroma`，Chroma 向量库数据在该卷内，容器自动生成的密钥会持久化到同一 `/data` 卷中。
- Redis 服务默认没有挂载持久化卷，只保存 RQ 队列和临时运行状态；跨机器同步测试数据通常不需要同步 Redis。
- 非 Docker 本地运行时，默认 `DATABASE_URL=sqlite:///./ainovel.db` 会解析到 `backend/ainovel.db`；未设置 `VECTOR_CHROMA_PERSIST_DIR` 时，Chroma 默认目录为 `backend/.chroma`。
- 两台机器要同步 Docker 测试数据时，至少需要同步 `postgres_data` 和 `app_data` 两个 Docker volume；只同步代码仓库不会带走数据库、向量库和自动生成密钥。

## 测试约定

- 修改 `tools/docker-up.sh` 后，至少运行 `bash tools/test-docker-up.sh` 验证 Compose 命令探测兼容性。
- 后端测试优先在 `backend/` 目录使用 `python -m pytest ...` 运行；当前环境直接执行 `pytest ...` 可能无法解析 `app` 包并报 `ModuleNotFoundError: No module named 'app'`。
- 当前全量 `cd backend && python -m pytest tests` 可能先被既有测试环境问题阻塞：`tests/test_gate_runner.py`、`tests/test_prompt_preset_integrity.py`、`tests/test_security_guard_runner.py` 依赖仓库中不存在的 `scripts.run_gate` / `scripts.guards`；忽略这 3 个文件后，当前还可见既有失败 `test_auth_session.py::TestAuthEndpoints::test_register_rejects_reserved_admin_user_id` 和 `test_prompt_task_reachability_registry.py::TestPromptTaskReachabilityRegistry::test_ui_copy_and_e2e_registry_registered`。

## 项目包导入导出约定

- 项目包导入上传大小上限由 `PROJECT_BUNDLE_IMPORT_MAX_BYTES` 配置，未配置或配置为非正数时默认 `52428800` 字节（50MB），后端会把过大的异常配置钳制到 500MB。
- 前端通过 `GET /api/projects/import_bundle/config` 获取项目包导入限制和支持的 `schema_version`，本地预检失败时使用 50MB 兜底。
- 项目包导入服务使用裸外键 ID 批量创建多张表时，不能依赖 SQLAlchemy 自动推断父子表 flush 顺序；PostgreSQL 会严格检查外键。新增导入实体时，父表应先 `db.flush()` 后再创建依赖子表，并在 roundtrip 测试里启用 SQLite `PRAGMA foreign_keys=ON` 覆盖该类问题。
- 世界书 `priority` 的当前合法值是 `drop_first`、`optional`、`important`、`must`；历史数据或旧项目包可能含有 `normal`，API 输出、预览和项目包导入导出边界应兼容并规范化为 `important`，避免 Pydantic 响应模型报 `INTERNAL_ERROR`。

## Vector RAG 约定

- Vector RAG 路由运行时优先使用项目的 Vector Embedding 专用配置；如果未单独配置 embedding API Key，会回退到项目绑定的默认 LLM Profile API Key，但不会用默认 LLM Profile 覆盖 Vector Embedding 的 provider/base_url/model。

## LLM 调用参数约定

- 大纲 JSON 修复、通用 JSON 修复、Fractal v2 等基于既有 `PreparedLlmCall` 派生的 LLM 调用，应保留模型配置页或任务预设解析后的 `max_tokens`；只覆盖必要的 `temperature` 等采样参数，避免固定小上限截断结构化输出。
- 排查实际 LLM 调用模型时，以 `generation_runs` 表为准；该表任务类型字段名是 `type`（例如 `chapter_analyze`、`chapter_rewrite`），不是 `run_type`。任务级模型覆盖配置在 `llm_task_presets.task_key/provider/model` 中，项目默认配置在 `llm_presets.provider/model` 中。

## 世界书自动更新约定

- 世界书页面的“手动触发”定义为补跑最新已完成章节的章节级 `worldbook_auto_update`，不作为项目级从大纲/世界观重建世界书入口。
- 手动触发必须基于 `status=done` 的章节正文；没有已完成章节时前端应阻止触发，后端接口也应返回 `details.reason=no_done_chapter`，避免创建 `worldbook:project:*` 空跑任务。
- 项目级世界书重建/提取如果未来需要，应设计独立入口和 prompt 策略，不复用当前章节增量更新按钮语义。

## 章节自动更新约定

- 写作页/章节接口的 `POST /api/chapters/{chapter_id}/trigger_auto_updates` 可由已保存章节或无未保存修改的章节显式触发；章节为草稿时只创建 `vector_rebuild`、`search_rebuild`，章节为 `status=done` 时创建 `vector_rebuild`、`search_rebuild` 和完整章节自动更新链。
- `PUT /api/chapters/{chapter_id}` 普通保存不创建任何 `ProjectTask`，包括 `vector_rebuild`、`search_rebuild` 和各类内容自动更新；只有显式调用 `trigger_auto_updates` 才触发后台更新任务。
- `PATCH /api/chapters/{chapter_id}/status` 是章节状态修改的唯一入口，请求体包含 `status` 和 `expected_status`；合法流转为 `planned -> drafting`、`drafting -> planned`、`drafting -> done`、`done -> drafting`。状态修改只改状态、标记 vector dirty，不创建任何 `ProjectTask`。
- `PUT /api/chapters/{chapter_id}` 只保存标题、计划、正文和摘要；请求体只要包含 `status` 就返回 `details.reason=chapter_status_update_requires_status_endpoint`。已定稿章节仍默认只读，直接通过 `PUT` 修改内容返回 `details.reason=chapter_done_readonly`。
- 前端写作页状态修改必须使用状态徽标和合法动作按钮，不能使用状态下拉框或把 `status` 放入保存 payload；有未保存内容修改时应先保存，`done -> drafting` 必须二次确认。
- 任务中心展示 `ProjectTask.kind` 时应显示中文任务类型并保留原码值，例如“世界书自动更新（worldbook_auto_update）”，未知 kind 原样显示码值。

## StoryMemory 与伏笔生命周期约定

- 伏笔时间线页面使用 `GET /api/projects/{project_id}/story_memories/foreshadows/open_loops`，数据来源是 `story_memories` 表中 `is_foreshadow=1` 且未回收的记录，不是结构化记忆表 `foreshadows`。
- `StoryMemory.chapter_id` 是章节派生记忆的来源字段；删除大纲、覆盖重建章节、删除单章时，应先删除命中这些 `chapter_id` 的 `StoryMemory`，避免旧章节伏笔变成无来源 open loop 继续展示。
- 用户手动创建或历史遗留的 `chapter_id=NULL` StoryMemory 不应默认进入伏笔时间线；伏笔时间线只展示仍有关联章节来源的未回收伏笔。

## Trellis 任务约定

- 当前 `.trellis/scripts/task.py list` 支持 `--mine` / `-m` 查看当前开发者任务，支持 `--status` / `-s` 按状态过滤；不支持 `--assignee` 参数。
