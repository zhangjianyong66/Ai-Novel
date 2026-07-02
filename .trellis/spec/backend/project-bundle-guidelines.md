# 项目包导入导出规范

## Scenario: Project Bundle Import/Export

### 1. Scope / Trigger

- Trigger: 项目包是跨后端服务、API、前端本地预检和环境变量的迁移协议。
- 适用范围：`backend/app/services/import_export_service.py`、`backend/app/api/routes/projects.py`、`backend/app/api/routes/export.py` 以及前端项目包解析/导入 UI。

### 2. Signatures

- `GET /api/projects/{project_id}/export/bundle`
  - 权限：`require_project_editor`。
  - 响应：`application/json; charset=utf-8` 附件，文件名 `*.bundle.json`。
- `POST /api/projects/import_bundle`
  - 权限：登录用户。
  - 请求：`{"bundle": <project_bundle_v1>, "rebuild_vectors": false}`。
  - 响应：`{"result": {"ok": true, "project_id": "...", "report": {...}, "vector_rebuild": ...}}`。
- `GET /api/projects/import_bundle/config`
  - 权限：登录用户。
  - 响应：`{"max_bytes": <int>, "schema_version": "project_bundle_v1"}`。

### 3. Contracts

- `schema_version` 当前严格为 `project_bundle_v1`。
- `PROJECT_BUNDLE_IMPORT_MAX_BYTES` 控制导入大小上限；未配置或非正数默认 `52428800`，异常大值钳制到 500MB。
- 项目包包含“可继续写作”的作品数据：项目基础信息、设置、LLM preset/task presets、大纲、章节、角色、世界书、PromptPresets、结构化记忆、StoryMemory、KB 配置、导入资料原文、数值表格、术语、项目默认写作风格副本。
- 项目包不包含运行历史、任务历史、搜索索引、向量索引、FractalMemory、PlotAnalysis、协作成员、用户偏好历史和任何 API Key 密文。

### 4. Validation & Error Matrix

- 非 `project_bundle_v1` -> `AppError.validation(details={"reason": "import_bundle_failed", "schema_version": "...", ...})`，服务层原始结果包含 `reason: "unsupported_schema_version"`。
- `Content-Length > PROJECT_BUNDLE_IMPORT_MAX_BYTES` -> `AppError.validation(details={"reason": "project_bundle_too_large", "max_bytes": ..., "actual_bytes": ...})`。
- JSON 解析后 `bundle` 序列化大小超过上限 -> 同上。
- API Key 存在标记只导入 masked 状态，不写 ciphertext，并在 report warnings 中提示。

### 5. Good/Base/Bad Cases

- Good: 导出包中只出现 `has_api_key` / `masked_api_key`，测试扫描不到 `*_ciphertext`。
- Base: 旧 `project_bundle_v1` 缺少新增 sections 时仍能导入，缺失 sections 按空列表处理。
- Bad: 直接复用旧项目的 `llm_profile_id`、`WritingStyle.owner_user_id` 或导入 `ProjectTask` 历史。

### 6. Tests Required

- Roundtrip 测试：新增实体导出后导入为新项目，ID 引用被重映射。
- 安全测试：bundle 字符串中不包含 API Key 密文字段。
- 路由测试：配置接口返回限制；超限导入返回 `project_bundle_too_large`。
- 前端测试：项目包本地 schema guard、摘要统计、API Key warning、大小格式化。

### 7. Wrong vs Correct

#### Wrong

```python
LLMTaskPreset(project_id=new_project_id, llm_profile_id=item.get("llm_profile_id"), ...)
```

#### Correct

```python
LLMTaskPreset(project_id=new_project_id, llm_profile_id=None, ...)
```

跨用户导入不能保留旧用户的 profile 引用；只迁移可继续写作的非密文参数。
