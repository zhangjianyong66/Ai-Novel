# 项目导入导出功能规划

## Goal

补齐“完整项目包”的导入导出体验，使用户可以把一个小说项目从当前系统导出为可迁移文件，并在同一系统或另一部署中导入为一个新项目，尽量保留可继续写作所需的数据。

本轮处于需求拷问和规划阶段，不直接实现。

## Confirmed Facts

- 后端已有项目包服务：`backend/app/services/import_export_service.py` 中存在 `export_project_bundle` 和 `import_project_bundle`。
- 后端已有 bundle 导出接口：`GET /api/projects/{project_id}/export/bundle`，位于 `backend/app/api/routes/export.py`。
- 后端已有 bundle 导入接口：`POST /api/projects/import_bundle`，位于 `backend/app/api/routes/projects.py`。
- 前端导出页 `frontend/src/pages/ExportPage.tsx` 当前只提供 Markdown 导出，没有项目包导出入口。
- 前端没有发现项目包导入入口；已有 `frontend/src/pages/ImportPage.tsx` 是“导入 txt/md 小说/资料到知识库”的功能，不是导入完整项目包。
- 后端已有 roundtrip 测试 `backend/tests/test_project_bundle_roundtrip.py`，验证导出后导入会创建新项目，并验证不导出向量 API Key 密文。
- 现有 bundle 已覆盖：项目基础信息、项目设置、LLM preset、大纲、章节、角色、世界书、PromptPresets、结构化记忆、StoryMemory、KnowledgeBase、ProjectSourceDocument。
- 现有 bundle 未明确覆盖或需要重新确认取舍的项目关联数据包括：数值表格 `ProjectTable/ProjectTableRow`、项目默认写作风格 `ProjectDefaultStyle` 及可能关联的用户写作风格、提纲生成偏好、章节生成指令历史、GlossaryTerm、FractalMemory、SearchIndex、PlotAnalysis、GenerationRun、ProjectTask/ProjectTaskEvent、MemoryTask、BatchGenerationTask。
- 现有导入逻辑始终创建新项目，不覆盖已有项目。
- 现有导入逻辑不会导入 API Key 密文，只保留 masked 信息并产生 `api_key_not_imported` warning。

## Requirements

- 需要定义“完整项目包”的数据范围：哪些项目内容必须进入 bundle，哪些运行/缓存/调试数据不进入 bundle。
- 需要提供用户可发现的前端入口，用于下载项目包 JSON 和上传项目包 JSON。
- 导入项目包应创建新项目，避免覆盖当前项目导致误删或混合数据。
- MVP 只支持导入为新项目，不支持覆盖或合并到已有项目。
- 导入成功后，项目列表应可刷新并能进入新项目继续编辑。
- 默认不在导入后自动重建向量/搜索索引。
- 导入完成后应提示“已导入作品数据，可稍后在 RAG/搜索相关页面手动重建”。
- 导入界面可以提供“导入后尝试重建向量索引”可选勾选项，默认关闭。
- 项目包导入 MVP 做前端本地预检摘要，不新增后端 dry-run 接口。
- 用户选择项目包文件后，前端解析 JSON 并展示项目名、`schema_version`、主要实体数量、API Key warning、是否可选重建向量；用户确认后再调用现有导入接口。
- MVP 只支持 `project_bundle_v1`；前端预检和后端导入都拒绝其他 `schema_version`。
- 导入成功后留在首页/导入区域显示导入报告，并提供主按钮“进入新项目”；不自动跳转。
- 项目包导出权限保持现有后端策略：只有项目 editor/owner 可导出 bundle；viewer 仍只能使用 Markdown 等阅读型导出。
- 项目包导入只要求登录用户。
- 项目包上传文件大小上限应可通过环境变量配置；未配置时默认 50MB。
- MVP 不提供“轻量项目包”导出选项；项目包默认包含导入资料原文。
- 如果用户只想发布作品，继续使用 Markdown 导出。
- 导出文件不得包含 API Key、密文、用户凭证或其他敏感配置。
- 导入跨部署项目时，应允许缺少 API Key，并在导入报告中说明需要重新配置。
- 需要保留现有 Markdown 导出，不把“作品发布用导出”和“项目迁移用导出”混为一个不可区分按钮。
- 导出入口放在项目内“导出”页。
- 导入入口放在首页/项目列表的新建项目区域。
- 首页导入入口与“新建项目”并列展示为“导入项目包”卡片。
- 项目内“导出”页应提供一个次要入口，链接到项目包导入入口。
- 项目包 MVP 覆盖“可继续写作的作品数据”，不覆盖运行历史、任务历史、搜索索引、向量索引这类可重建/调试/缓存数据。
- MVP 应纳入：项目基础信息、项目设置、LLM preset、LLM task presets、写作内容、大纲、章节、角色、世界书、PromptPresets、结构化记忆、StoryMemory、知识库配置、导入资料原文、数值表格、术语表、项目默认写作风格绑定。
- 项目默认写作风格绑定到用户级 `WritingStyle` 时，只复制项目默认使用的那一个写作风格的名称、描述、prompt 内容，并在导入后创建为当前导入用户拥有的非预设风格，再绑定到新项目。
- MVP 默认不纳入：GenerationRun、ProjectTask、ProjectTaskEvent、MemoryTask、BatchGenerationTask、SearchIndex、向量库实际索引、FractalMemory 缓存/派生结果、PlotAnalysis 派生分析结果、API Key 密文、成员协作关系、提纲生成 tone/pacing 偏好、章节生成指令历史。

## Acceptance Criteria

- [ ] 用户可以在前端下载 `.bundle.json` 项目包。
- [ ] 用户可以在前端上传 `.bundle.json` 并导入为一个新项目。
- [ ] 导入成功后显示新项目名称、导入统计和关键 warning，并提供进入新项目的路径。
- [ ] 导出/导入接口有后端测试覆盖核心实体 roundtrip、敏感字段不外泄、非法 schema 拒绝。
- [ ] 前端有针对项目包导入/导出状态、JSON 解析失败、接口失败的测试或等价验证。
- [ ] 项目包数据范围在 PRD/design 中明确列出，未纳入的数据有明确理由。
- [ ] 项目包上传文件大小上限可通过环境变量配置；未配置时默认 50MB，前端预检和后端导入都能执行限制。

## Notes

- 这是复杂任务，开始实现前需要补 `design.md` 和 `implement.md`。
- 现有 `/projects/{project_id}/imports` 命名已用于资料导入；项目包导入应避免在前端文案上与资料导入混淆。

## Decisions

- 项目包范围：覆盖“可继续写作的作品数据”，不覆盖运行历史、任务历史、搜索索引、向量索引这类可重建/调试/缓存数据。
- 入口位置：导出放在项目内“导出”页；导入放在首页/项目列表的新建项目区域，同时在项目内“导出”页放一个次要入口链接到导入。
- 重建策略：默认不自动重建；导入完成后提示用户可稍后在 RAG/搜索相关页面手动重建；导入界面可提供默认关闭的“导入后尝试重建向量索引”勾选项。
- 导入模式：MVP 只支持导入为新项目，不支持覆盖或合并到已有项目。
- 写作风格：只复制项目默认使用的那一个写作风格的名称、描述、prompt 内容，并在导入后创建为当前导入用户拥有的非预设风格，再绑定到新项目。
- 用户偏好/历史输入：MVP 不导出提纲 tone/pacing 偏好和章节生成指令历史。
- 派生分析结果：MVP 不导出 FractalMemory、PlotAnalysis，把它们视为可重建/可重新分析的数据。
- 导入预检：MVP 做前端本地预检摘要，不新增后端 dry-run 接口；用户选择文件后前端解析 JSON，展示项目名、schema_version、主要实体数量、是否包含 API Key warning、是否可选重建向量；用户确认后再调用现有导入接口。
- Schema 兼容：MVP 只支持 `project_bundle_v1`；前端预检和后端导入都拒绝其他 `schema_version`。
- 导入完成页：导入成功后留在首页/导入区域显示导入报告，并提供主按钮“进入新项目”；不自动跳转。
- 权限：项目包导出要求 editor/owner；项目包导入只要求登录用户。
- 文件大小：项目包上传文件大小上限通过环境变量配置；未配置时默认 50MB。
- 轻量包：MVP 不提供轻量项目包导出选项；项目包默认包含导入资料原文；作品发布继续使用 Markdown 导出。
- 首页入口形态：首页导入入口与“新建项目”并列展示为“导入项目包”卡片。
