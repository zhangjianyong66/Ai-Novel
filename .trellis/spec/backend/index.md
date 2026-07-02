# 后端开发规范

本目录记录 `backend/` 的实际约定。后端是 FastAPI + SQLAlchemy 2.x + Alembic，入口在 `backend/app/main.py`，API 统一挂载在 `/api`。

## 必读清单

开始修改后端前，按任务相关性读取：

- [目录结构](./directory-structure.md)：路由、服务、模型、schema、资源和脚本放置规则。
- [数据库规范](./database-guidelines.md)：SQLAlchemy 模型、Session、迁移、SQLite/Postgres 约束。
- [错误处理](./error-handling.md)：`AppError`、统一响应、鉴权/权限失败语义。
- [日志规范](./logging-guidelines.md)：JSON 日志、`X-Request-Id`、敏感信息脱敏。
- [项目包导入导出规范](./project-bundle-guidelines.md)：项目包 API、环境变量、数据范围、敏感字段和前端预检契约。
- [质量规范](./quality-guidelines.md)：运行命令、测试要求、安全与生成链路检查。

## 常用命令

- 安装依赖：`cd backend && python -m pip install -r requirements.txt`
- 本地启动：`cd backend && python -m uvicorn app.main:app --reload --workers 1 --port 8000`
- 后端测试：`cd backend && python -m pytest tests`
- Docker 推荐启动：`docker compose --env-file .env.docker up -d --build`
- 生产 Compose 覆盖：`docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.docker up -d --build`

## 重要约定

- SQLite 只用于本地单 worker；多 worker、队列任务、Postgres/Redis/RQ 应使用 Docker Compose。
- API 成功响应使用 `ok_payload`，失败响应使用 `AppError` 或全局异常处理器，不要在路由里拼临时错误结构。
- 任何 API Key、token、base URL 凭据和 LLM 上游错误都必须走脱敏路径，不能直接写日志或返回前端。
- 章节生成、记忆、RAG、Prompt preset、批量任务属于核心链路，改动前后要跑对应测试，不能只跑冒烟命令。
