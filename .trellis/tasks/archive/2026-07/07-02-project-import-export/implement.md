# 项目导入导出功能实施计划

## 范围

本轮只执行项目包导入导出 MVP：

- 补齐 bundle 数据范围。
- 增加导入大小配置。
- 增加 Dashboard 导入入口和 ExportPage 项目包导出入口。
- 增加测试与验证。

不执行覆盖/合并已有项目、压缩包/分片上传、后端 dry-run、轻量包导出、成员迁移。

## 实施步骤

### 1. 后端配置与接口

- [x] 在 `backend/app/core/config.py` 增加 `project_bundle_import_max_bytes`，默认 50MB，validator 规范化。
- [x] 在 `backend/app/api/routes/projects.py` 增加 `GET /projects/import_bundle/config`，返回 max bytes 和 schema version。
- [x] 在 `POST /projects/import_bundle` 增加 Content-Length 和序列化后大小限制。
- [x] 为配置默认值、配置接口、超限导入补后端测试。

### 2. 后端 bundle 数据补齐

- [x] 扩展 `backend/app/services/import_export_service.py` imports：`LLMTaskPreset`、`ProjectTable`、`ProjectTableRow`、`GlossaryTerm`、`ProjectDefaultStyle`、`WritingStyle`。
- [x] 导出补齐 ProjectSettings 缺失字段，继续排除密文。
- [x] 导出/导入 `llm_task_presets`，导入时 `llm_profile_id=None`。
- [x] 导出/导入 `project_tables` 和 rows，导入时重映射 table_id。
- [x] 导出/导入 `glossary_terms`。
- [x] 导出默认写作风格内容；导入时创建当前用户非预设 `WritingStyle` 并绑定 `ProjectDefaultStyle`。
- [x] 扩展 `backend/tests/test_project_bundle_roundtrip.py`，验证新增实体 roundtrip、敏感字段不外泄、派生/历史表不导出。

### 3. 前端项目包解析模块

- [x] 新增 `frontend/src/pages/projectBundle.ts`，定义类型、schema guard、summary builder、文件大小 formatter。
- [x] 新增 `frontend/src/pages/projectBundle.test.ts`，覆盖合法摘要、非法 schema、空/缺失 sections、API Key warning、大小格式化。

### 4. Dashboard 导入入口

- [x] 在 `frontend/src/pages/DashboardPage.tsx` 与“新建项目”并列增加“导入项目包”卡片。
- [x] 增加导入弹窗/区域状态：文件、预检摘要、重建向量勾选、提交中、导入报告。
- [x] 调用 `GET /api/projects/import_bundle/config` 获取大小限制，失败时 50MB 兜底。
- [x] 调用 `POST /api/projects/import_bundle`，成功后 `refresh()`，不自动跳转，显示“进入新项目”按钮。
- [x] 支持 `?importBundle=1` 时聚焦或打开导入入口，供导出页链接使用。

### 5. ExportPage 项目包导出入口

- [x] 在 `frontend/src/pages/ExportPage.tsx` 增加“项目包备份/迁移”区域。
- [x] 使用 `apiDownloadAttachment` 下载 `/api/projects/{project_id}/export/bundle`。
- [x] 成功 toast 显示“已导出项目包”。
- [x] 提供次要链接到 `/?importBundle=1`。

### 6. 文档与环境示例

- [x] 在 `backend/.env.example` 增加 `PROJECT_BUNDLE_IMPORT_MAX_BYTES=52428800`。
- [x] 在 `.env.docker.example` 增加同名配置，必要时同步 `.env.docker` 的默认值。
- [x] 如发现新的运行约定，按项目要求更新根目录 `AGENTS.md`。

## 验证命令

后端：

```bash
cd backend && python -m pytest tests/test_project_bundle_roundtrip.py
cd backend && python -m pytest tests/test_config_env_contract.py
```

前端：

```bash
cd frontend && npm test -- projectBundle
cd frontend && npm run build
```

最终回归建议：

```bash
cd backend && python -m pytest tests/test_project_bundle_roundtrip.py tests/test_request_size_limits.py
cd frontend && npm test
```

## 风险点

- `project_bundle_v1` 被扩展新增 sections，旧 bundle 缺字段必须能导入。
- 默认写作风格是用户级资源，导入时必须改 owner 为当前用户，不能保留旧 owner。
- `LLMTaskPreset.llm_profile_id` 不能跨用户迁移。
- API Key 密文字段必须继续用测试扫描防泄漏。
- 前端预检不能成为唯一校验；后端必须重复 schema 和大小限制。

## 回滚点

- 前端入口可单独回滚，不影响已有后端接口。
- 后端新增 sections 应使用缺省空列表/空对象，避免破坏旧 bundle。
- 若大小限制误伤，可通过环境变量临时调大。
