# 项目导入导出功能设计

## 目标边界

本任务补齐“项目包”迁移能力，而不是作品发布能力或数据库级备份能力。

- 作品发布继续使用 Markdown 导出。
- 项目包导出/导入用于在同一系统或另一部署中继续写作。
- MVP 只导入为新项目，不支持覆盖或合并已有项目。
- MVP 不迁移运行历史、任务历史、搜索索引、向量索引、派生分析结果和协作成员。

## 现状

- `backend/app/services/import_export_service.py` 已有 `export_project_bundle` / `import_project_bundle`。
- `GET /api/projects/{project_id}/export/bundle` 已暴露 bundle 导出，要求 editor/owner。
- `POST /api/projects/import_bundle` 已暴露 bundle 导入，创建新项目。
- `frontend/src/pages/ExportPage.tsx` 只提供 Markdown 导出。
- `frontend/src/pages/DashboardPage.tsx` 有“新建项目”卡片和项目列表，适合放“导入项目包”入口。
- `frontend/src/services/apiClient.ts` 已有 `apiDownloadAttachment`，可复用为 `.bundle.json` 下载。

## 数据格式

继续使用严格版本：`schema_version: "project_bundle_v1"`。

`project_bundle_v1` 应覆盖：

- `project`：名称、类型、logline、active outline 引用。
- `settings`：世界观、风格、约束、上下文优化、query preprocessing、自动更新开关、向量 embedding/rerank 非密文字段和 masked key 状态。
- `llm_preset`：项目主模型参数，不含 profile API Key。
- `llm_task_presets`：任务级模型参数；`llm_profile_id` 不跨项目迁移，导入后置空，只保留 provider/base_url/model/参数/extra_json。
- `outlines` / `chapters`：重映射 outline/chapter ID。
- `characters`。
- `worldbook`。
- `prompt_presets` / `prompt_blocks`。
- `structured_memory`：entity/relation/event/foreshadow/evidence；重映射 entity/chapter 引用。
- `story_memory`：重映射 chapter 引用。
- `knowledge_bases`：KB 配置，不包含向量索引。
- `source_documents`：导入资料原文、KB 绑定、提案 JSON；不包含 chunk 表和向量 chunk。
- `project_tables`：数值表格定义和行；导入时重映射 table_id。
- `glossary_terms`：术语、别名、来源、origin、enabled。
- `default_writing_style`：只包含项目默认使用的一个写作风格的 name/description/prompt_content。导入时创建当前用户拥有的非预设 `WritingStyle`，并写入 `ProjectDefaultStyle`。

明确不导出：

- `GenerationRun`、`ProjectTask`、`ProjectTaskEvent`、`MemoryTask`、`BatchGenerationTask`。
- `SearchDocument` / 搜索索引。
- 向量库实际索引和 `ProjectSourceDocumentChunk`。
- `FractalMemory`、`PlotAnalysis`。
- `ProjectMembership` 中除导入用户 owner 外的协作关系。
- `ProjectOutlineGenerationPreference`、`ProjectChapterGenerationInstructionPreference`。
- API Key 密文、用户密码、外部账号、通知 webhook 等用户级敏感信息。

## 后端设计

### 配置

在 `backend/app/core/config.py` 增加：

- `project_bundle_import_max_bytes: int = 50 * 1024 * 1024`

通过 Pydantic validator 规范化：

- 未配置或 <= 0 使用默认 50MB。
- 可设置合理硬上限，避免误配置导致内存风险；建议上限 500MB。

新增只读配置接口，供前端预检使用：

- `GET /api/projects/import_bundle/config`
- 返回 `{ "max_bytes": <int>, "schema_version": "project_bundle_v1" }`
- 只要求登录用户。

### 导出

扩展 `export_project_bundle`：

- 补齐 ProjectSettings 当前缺失字段：自动更新开关、rerank provider/base_url/model/timeout/hybrid_alpha/has_api_key/masked_api_key。
- 补齐 `LLMTaskPreset`。
- 补齐 `ProjectTable` / `ProjectTableRow`。
- 补齐 `GlossaryTerm`。
- 补齐默认写作风格副本数据。
- 保持 API Key 密文不进入 payload；测试中继续用字符串扫描防回归。

### 导入

扩展 `import_project_bundle`：

- 严格拒绝非 `project_bundle_v1`。
- 创建新项目和 owner membership。
- 导入 ProjectSettings 时恢复非密文字段；如果 bundle 表明有 API Key，写入 masked 字段并追加 warning，不写 ciphertext。
- 导入 `LLMTaskPreset` 时 `llm_profile_id=None`，避免跨用户 profile 断链或越权。
- 导入表格时建立 `table_id_map`，行写入新 table_id。
- 导入默认写作风格时创建当前用户自己的 `WritingStyle(is_preset=False)`，再创建 `ProjectDefaultStyle`。
- 导入 source documents 时保留原文和 KB 绑定，chunk_count 置 0，状态为 imported/done；向量索引由用户后续重建。
- `rebuild_vectors` 默认 false；若用户勾选，沿用现有可选 rebuild 分支，但失败应在 `vector_rebuild` 中报告，不让项目创建回滚。

### 导入大小限制

现有 `POST /api/projects/import_bundle` 接收 JSON body。后端在路由层可根据原始 body 解析前限制体积，或在服务入口对 `request.headers["content-length"]` 和序列化后近似体积做防护。

推荐实现：

- 路由读取 `Content-Length`，超过 `settings.project_bundle_import_max_bytes` 直接 `AppError.validation`，details 含 `max_bytes`。
- 解析后对 `json.dumps(body.bundle, ensure_ascii=False).encode("utf-8")` 再做一次限制，覆盖无 Content-Length 场景。
- 前端预检仍是第一道用户体验限制，后端是权威限制。

## 前端设计

### Dashboard 导入入口

在 `DashboardPage` 中与“新建项目”并列新增“导入项目包”卡片。

交互状态：

- 选择 `.json` / `.bundle.json` 文件。
- 检查文件大小，使用后端配置接口返回的 max bytes；配置加载失败时使用 50MB 兜底并提示。
- 本地 `File.text()` + `JSON.parse`。
- 本地预检只接受 `schema_version === "project_bundle_v1"`。
- 展示摘要：项目名、schema_version、章节/大纲/角色/世界书/PromptPresets/记忆/KB/导入资料/数值表格/术语等数量、API Key 未迁移 warning、向量索引默认不重建提示。
- 勾选项：“导入后尝试重建向量索引”，默认关闭。
- 用户确认后调用 `POST /api/projects/import_bundle`。
- 成功后 `refresh()` 项目列表，停留在 Dashboard 导入区域显示报告和“进入新项目”主按钮。

### ExportPage 导出入口

在 `ExportPage` 保留 Markdown 导出，新增“项目包备份/迁移”区域：

- 主按钮下载 `.bundle.json`，调用 `apiDownloadAttachment("/api/projects/{project_id}/export/bundle")`。
- 明确文案区分：Markdown 用于阅读/发布，项目包用于迁移/继续写作。
- 次要入口跳转到首页导入区域；可用 `/?importBundle=1` 这类查询参数触发导入区域聚焦/打开。

### 类型和复用

新增前端模块建议：

- `frontend/src/pages/projectBundle.ts`：bundle 类型、摘要统计、schema guard、文件大小格式化。
- `frontend/src/pages/projectBundle.test.ts`：覆盖 schema 拒绝、统计、API Key warning、大小格式化。

避免在 Dashboard 和 ExportPage 分散解析 bundle 字段；由 `projectBundle.ts` 统一拥有 payload contract。

## 错误与安全

- 非 JSON：前端提示“项目包 JSON 解析失败”。
- 非 `project_bundle_v1`：前端预检拒绝；后端再次拒绝。
- 文件超限：前端拒绝；后端再次拒绝。
- 权限：bundle 导出保持 editor/owner，导入只要求登录。
- 敏感信息：导出测试必须覆盖 ciphertext 不出现；设计上只允许 masked/has_key。
- 导入 warning 需要可见，不自动跳转新项目。

## 兼容与回滚

- 格式仍为 `project_bundle_v1`，但字段向后兼容：新增 sections 导入端对缺失字段使用空列表/空对象。
- 若补齐字段被认为应升级版本，可在实现时改为 `project_bundle_v2`，但当前用户决策是 MVP 只支持 `project_bundle_v1`，因此本设计按 v1 扩展可选字段处理。
- 回滚前端时，已有后端导入/导出接口仍可被直接调用。
- 回滚后端扩展时，前端应能展示旧 bundle 的基本统计，但缺少新增 sections。
