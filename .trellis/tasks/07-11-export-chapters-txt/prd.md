# 章节内容增加 TXT 导出

## Goal

在现有项目导出能力中增加 TXT 格式导出，让用户可以下载适合直接阅读、投稿、归档或复制到纯文本工具的小说章节正文。

## Confirmed Facts

- 当前后端导出路由位于 `backend/app/api/routes/export.py`。
- 当前已有 `GET /api/projects/{project_id}/export/markdown`，返回 `text/markdown; charset=utf-8`，下载文件后缀为 `.md`。
- 当前 Markdown 导出可通过查询参数控制是否包含设定、角色卡、大纲，以及章节范围 `all` / `done`。
- 当前 Markdown 导出只导出 active outline 下的章节，按 `Chapter.number` 升序输出。
- 当前前端导出页位于 `frontend/src/pages/ExportPage.tsx`，页面包含“导出 Markdown”和“项目包备份/迁移”两个导出区块。
- 当前下载文件名已有时间戳测试覆盖，位于 `backend/tests/test_export_download_filenames.py`。
- 2026-07-11 追加确认：Markdown 和 TXT 都需要支持按章节选择导出。

## Requirements

- 增加 TXT 格式导出入口，供用户下载小说章节内容。
- TXT 导出应复用现有项目权限、章节范围选择和下载文件名安全处理规则。
- TXT 导出只包含章节标题和章节正文，不包含设定、角色卡或大纲。
- 前端导出页应提供清晰的 TXT 下载操作，不破坏现有 Markdown 导出和项目包导出。
- Markdown 和 TXT 导出都应在现有 `all` / `done` 范围之外支持 `selected` 范围。
- 选择章节范围只作用于当前 active outline，导出结果仍按章节号升序输出，不按勾选顺序输出。
- `chapters=selected` 使用重复查询参数传章节 ID，例如 `chapter_ids=id1&chapter_ids=id2`。
- `chapters=selected` 时不叠加“仅定稿章节”过滤；草稿章节可以被用户明确选择并导出。
- `chapters=selected` 且未传任何章节 ID 时，前端应禁用导出按钮并提示选择至少一个章节，后端也应返回参数错误。
- `chapter_ids` 包含不存在、其他项目、或非当前 active outline 的章节 ID 时，后端应返回参数错误，不做部分导出。
- Markdown 在选择章节导出时仍保留“设定 / 角色卡 / 大纲”包含选项；TXT 仍只导出书名、章节标题和章节正文。
- 前端章节范围保留“全部章节 / 仅定稿章节”，新增“选择章节”；只有选中“选择章节”时展示章节勾选列表。
- 章节勾选列表展示当前 active outline 的全部章节，提供“全选 / 清空 / 仅选择定稿”操作，章节行展示章节号、标题、状态和是否有正文。
- 选择章节模式首次进入默认不勾选任何章节；同一次页面会话内切换范围再切回时保留已勾选章节，刷新页面后不持久化。
- 当前项目无章节时，现有“全部章节 / 仅定稿章节”空正文导出行为保持不变；“选择章节”模式禁用并显示暂无可选择章节。
- 章节列表加载失败时，禁用“选择章节”模式，保留现有范围导出并提供错误提示或重试入口。
- 本轮暂不新增搜索框、按范围选择、POST 下载接口或大批量选章专用下载接口。

## Acceptance Criteria

- [x] 用户可以从导出页下载 `.txt` 文件。
- [x] TXT 文件使用 UTF-8 文本响应和 `.txt` 下载文件名。
- [x] TXT 导出按章节号升序输出章节标题和正文。
- [x] TXT 导出支持“全部章节”和“仅定稿章节”范围。
- [x] TXT 导出不包含设定、角色卡或大纲内容。
- [x] 现有 Markdown 导出行为保持不变。
- [x] 后端测试覆盖 TXT 下载文件名和正文内容格式。
- [x] 用户可以在导出页选择指定章节并导出 Markdown。
- [x] 用户可以在导出页选择指定章节并导出 TXT。
- [x] 后端 `chapters=selected` 只接受当前 active outline 下的章节 ID，并对空选择或非法 ID 返回参数错误。
- [x] 选择章节导出按章节号升序输出，且不静默跳过非法章节 ID。
- [x] 前端选择章节模式默认空选择，空选择时禁用 Markdown/TXT 导出，并提供明确提示。
- [x] 前端选择章节列表提供“全选 / 清空 / 仅选择定稿”，且刷新页面不持久化选择。

## Out of Scope

- 不新增 TXT 导入能力。
- 不改变项目包导出/导入协议。
- 不改变 Markdown 导出内容结构。
- 不新增 POST 下载接口。
- 不新增章节搜索或按编号范围批量选择。
