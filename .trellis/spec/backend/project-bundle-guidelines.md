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
- 章节迁移必须包含 `chapter_versions` 历史和 `chapters.active_version_id`；导入时先创建章节，再创建版本，最后把旧激活版本 ID 映射到新版本 ID 后回填章节，避免外键指向旧项目或未创建版本。
- StoryMemory 迁移必须包含并映射 `scope` / `outline_id`；`scope=outline` 只能指向导入后同项目的新大纲 ID，无法映射时降级为 `unassigned` 且清空 `outline_id`。
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
- Roundtrip 测试必须覆盖章节版本历史、章节激活版本、StoryMemory 作用域和所属大纲映射。
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

## Scenario: Project Content Markdown/TXT Export

### 1. Scope / Trigger

- Trigger: 普通内容导出是后端附件响应、前端下载动作和用户可见文件格式的跨层契约。
- 适用范围：`backend/app/api/routes/export.py`、`frontend/src/pages/ExportPage.tsx`、`frontend/src/services/apiClient.ts`。

### 2. Signatures

- `GET /api/projects/{project_id}/export/markdown`
  - 权限：`require_project_viewer`。
  - Query：`include_settings=1|0`、`include_characters=1|0`、`include_outline=1|0`、`chapters=all|done`。
  - 响应：`text/markdown; charset=utf-8` 附件，文件名 `*.md`。
- `GET /api/projects/{project_id}/export/txt`
  - 权限：`require_project_viewer`。
  - Query：`chapters=all|done`。
  - 响应：`text/plain; charset=utf-8` 附件，文件名 `*.txt`。

### 3. Contracts

- Markdown 和 TXT 都只导出当前 active outline 下的章节；若项目没有 active outline，则回退到同项目最近更新的大纲。
- 章节按 `Chapter.number` 升序输出；`chapters=done` 只包含 `status == "done"` 的章节，否则包含全部章节。
- Markdown 是资料汇总格式，可包含项目设定、角色卡、大纲和正文。
- TXT 是纯小说正文格式，只包含书名、章节标题和章节正文，不包含设定、角色卡或大纲。
- 下载响应必须带 `Content-Disposition`，同时提供 ASCII `filename` 和 UTF-8 `filename*`，并保留 `X-Request-Id`。

### 4. Validation & Error Matrix

- 用户无项目查看权限 -> 由 `require_project_viewer` 按项目权限规则返回 404/403。
- 项目没有可导出章节 -> 返回合法附件内容，正文中显示空章节占位，不返回错误。
- `chapters` 非 `done` -> 当前按全部章节处理；不要让前端依赖其他未定义值。

### 5. Good/Base/Bad Cases

- Good: TXT 下载只输出 `《书名》`、`第N章 标题` 和正文，适合投稿/阅读。
- Base: 空正文章节在 TXT 中显示 `（空）`，Markdown 中显示 `_（空）_`。
- Bad: 为 TXT 复用 Markdown 的设定/角色/大纲选项，导致纯正文导出混入项目资料。

### 6. Tests Required

- 路由测试：Markdown、TXT、bundle 文件名均包含项目名和时间戳，后缀正确。
- 路由测试：TXT 内容按章节号升序，只包含章节正文，不包含大纲/设定/角色资料。
- 路由测试：`chapters=done` 只导出定稿章节。
- 前端检查：导出页提供 TXT 下载动作，并通过 `apiDownloadAttachment` 或同等附件下载 helper 处理下载。

### 7. Wrong vs Correct

#### Wrong

```python
parts.append(active_outline.content_md or "")
parts.extend(ch.content_md for ch in chapter_rows)
```

#### Correct

```python
parts.append(f"《{project.name}》")
parts.append(f"第{chapter.number}章 {chapter.title}".rstrip())
parts.append(chapter.content_md if chapter.content_md else "（空）")
```

TXT 导出必须保持纯正文边界；大纲、设定和角色资料属于 Markdown 或项目包场景。
