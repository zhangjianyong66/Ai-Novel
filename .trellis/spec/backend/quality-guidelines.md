# 后端质量规范

## 运行与测试命令

- 本地启动：`cd backend && python -m uvicorn app.main:app --reload --workers 1 --port 8000`
- 全量后端测试：`cd backend && python -m pytest tests`
- 依赖安装：`cd backend && python -m pip install -r requirements.txt`
- Docker 栈：`docker compose --env-file .env.docker up -d --build`

没有独立 lint 配置时，后端质量主要依赖类型清晰、测试覆盖和现有模式一致性。

## 必守模式

- 所有 Python 源码使用 `from __future__ import annotations`，保持当前项目风格。
- API 层使用 `DbDep`、`UserIdDep` 等依赖别名，不直接从 request 猜用户。
- 响应使用 `ok_payload` / `AppError` 契约。
- 配置集中在 `backend/app/core/config.py` 的 `Settings`，新增环境变量必须有默认值、类型和必要 validator。
- LLM 调用、生成 run、prompt、错误审计要沿用现有 `llm/` 与 `services/run_store.py` 路径。
- 章节分析、章节改写、记忆更新自动提议等生成类路由必须保留模型配置页的 `max_tokens`/`max_output_tokens`；只覆盖必要的 `temperature` 等采样参数，避免低上限截断 JSON 契约输出。
- 生成、记忆、RAG、批量任务改动必须同步或新增测试。

## 测试选择

常见对应关系：

- 配置变更：`backend/tests/test_config_*.py`
- 错误/日志/脱敏：`backend/tests/test_app_error_str.py`、`test_logging_*.py`、`test_secrets_*.py`
- 章节生成/SSE：`test_chapter_generate_stream_keepalive.py`、`test_generation_service_records_errors.py`
- Prompt preset/block：`test_prompt_*.py`
- 批量任务/RQ：`test_batch_generation_*.py`、`test_task_queue_*.py`
- RAG/向量：`test_vector_*.py`
- 记忆/世界书/图谱/表格自动更新：对应 `test_memory_*`、`test_worldbook_*`、`test_graph_*`、`test_table_*`

## 安全和部署检查

- 生产环境必须设置 `APP_ENV=prod`，显式 `CORS_ORIGINS`，关闭 `AUTH_DEV_FALLBACK_USER_ID`。
- 管理员密码由 `AUTH_ADMIN_USER_ID` / `AUTH_ADMIN_PASSWORD` 在空库首次初始化时写入；修改 env 不会自动重置既有密码。
- `.env.docker`、API Key、真实账号、私有 Base URL 和数据卷不得提交。
- 外部 Postgres 需要支持 `pgvector`；否则配置 `VECTOR_BACKEND=chroma`。

## 避免

- 不要为了修测试改弱生产安全 validator。
- 不要在 SQLite 多 worker 下引入长事务或后台队列假设。
- 不要只验证 happy path；本项目大量逻辑要求 fail-soft、脱敏和错误细节稳定。
