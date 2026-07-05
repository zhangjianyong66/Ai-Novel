# 章节 AI 生成与优化历史版本执行计划

## Checklist

1. 勘察现有章节模型、生成接口、优化接口、前端写作页和测试模式。
2. 按 TDD 新增后端版本服务/接口测试，先验证失败。
3. 新增 SQLAlchemy 模型、Alembic 迁移、schema 和统一版本服务。
4. 接入章节生成、流式生成和章节优化/改写路径，确保最终结果落库并激活。
5. 新增版本列表、详情、激活 API，并在章节详情中返回 active version 摘要。
6. 更新前端类型和 API service。
7. 更新写作页 UI：版本历史入口、列表、预览、激活、未保存修改/`done` 防护、生成完成后的已保存状态。
8. 补充或更新前端测试；至少通过 TypeScript 构建验证关键接口和状态。
9. 更新项目级 `AGENTS.md`，记录章节 AI 版本化约定。
10. 运行后端目标测试、前端构建/测试和必要回归。

## Validation Commands

- `cd backend && .venv/bin/python -m unittest tests.<target>` 或 `cd backend && python3 -m pytest <target>`，按本地可用环境选择。
- `cd frontend && npm run build`
- 如改动 UI class 或 lint 相关：`cd frontend && npm run lint`

## Risky Files

- `backend/app/models/chapter.py`
- `backend/app/api/routes/chapters.py`
- `backend/app/api/routes/chapter_analysis.py`
- `backend/alembic/versions/*`
- `frontend/src/pages/writing/*`
- `frontend/src/types.ts`

## Review Gates

- 后端测试必须覆盖创建/激活版本、懒快照、`done` 章节拒绝、接口权限边界的核心行为。
- 前端必须确保版本激活不会覆盖未保存修改。
- 生成接口必须保留原响应字段，避免破坏现有调用。
