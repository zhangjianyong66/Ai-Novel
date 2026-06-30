# 后端目录结构

## 项目布局

`backend/` 是 FastAPI 服务，核心目录如下：

```text
backend/
├── alembic/                 # Alembic 迁移版本
├── app/
│   ├── api/                 # FastAPI 路由、依赖和聚合 router
│   │   └── routes/          # 按业务域拆分的 endpoint
│   ├── core/                # 配置、错误、日志、request id、密钥
│   ├── db/                  # SQLAlchemy engine/session、迁移启动、时间工具
│   ├── llm/                 # LLM provider、HTTP client、审计、脱敏、能力
│   ├── models/              # SQLAlchemy ORM 模型
│   ├── resources/           # 内置 prompt preset/block 等资源
│   ├── schemas/             # Pydantic 请求/响应 schema
│   ├── services/            # 业务服务、生成链路、RAG、任务队列
│   └── utils/               # 通用工具，例如 SSE 响应
├── scripts/                 # 容器/worker 辅助脚本
└── tests/                   # pytest/unittest 风格测试
```

参考文件：`backend/app/main.py`、`backend/app/api/router.py`、`backend/app/api/deps.py`。

## 分层放置规则

- 新 API endpoint 放在 `backend/app/api/routes/<domain>.py`，并在 `backend/app/api/router.py` 注册到 `api_router`。
- 请求/响应模型放在 `backend/app/schemas/`；已有领域优先扩展对应文件，例如章节使用 `schemas/chapters.py`、生成使用 `schemas/chapter_generate.py`。
- 数据表模型放在 `backend/app/models/`，使用 SQLAlchemy 2.x `Mapped[...]` / `mapped_column` 风格。
- 业务逻辑放在 `backend/app/services/`。路由只做依赖注入、权限检查、请求解析和响应组装。
- 共享配置、错误、日志、密钥、request id 放在 `backend/app/core/`，不要散落到业务服务中。
- LLM provider 兼容、消息格式、重试、脱敏和审计放在 `backend/app/llm/`。
- 默认 prompt preset/block 资源放在 `backend/app/resources/prompt_presets/`，不要硬编码到路由。

## 核心链路位置

- 章节生成 API：`backend/app/api/routes/chapters.py`
- 章节上下文：`backend/app/services/chapter_context_service.py`
- 生成流水线：`backend/app/services/generation_pipeline.py`
- LLM 调用与记录：`backend/app/services/generation_service.py`、`backend/app/services/run_store.py`
- 记忆检索：`backend/app/services/memory_retrieval_service.py`
- 批量生成：`backend/app/api/routes/batch_generation.py`、`backend/app/services/batch_generation_service.py`
- RAG/向量：`backend/app/services/vector_rag_service.py`、`backend/app/services/vector_kb_service.py`

## 命名约定

- 文件和模块使用小写 snake_case。
- 路由函数名称描述动作，例如 `list_projects`、`create_project`。
- 权限检查函数集中在 `api/deps.py`，使用 `require_project_viewer/editor/owner` 这类命名。
- Pydantic 请求模型可在路由内定义小型私有模型；跨路由复用或公开契约放入 `schemas/`。

## 避免

- 不要把数据库查询和复杂业务规则全部写进路由函数。
- 不要新增孤立的全局工具目录来绕开既有 `core/`、`db/`、`llm/`、`services/` 边界。
- 不要把默认 prompt、生成契约或大段模板写死在 endpoint 中。
