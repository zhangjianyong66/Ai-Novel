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

## Requirements

- 增加 TXT 格式导出入口，供用户下载小说章节内容。
- TXT 导出应复用现有项目权限、章节范围选择和下载文件名安全处理规则。
- TXT 导出只包含章节标题和章节正文，不包含设定、角色卡或大纲。
- 前端导出页应提供清晰的 TXT 下载操作，不破坏现有 Markdown 导出和项目包导出。

## Acceptance Criteria

- [x] 用户可以从导出页下载 `.txt` 文件。
- [x] TXT 文件使用 UTF-8 文本响应和 `.txt` 下载文件名。
- [x] TXT 导出按章节号升序输出章节标题和正文。
- [x] TXT 导出支持“全部章节”和“仅定稿章节”范围。
- [x] TXT 导出不包含设定、角色卡或大纲内容。
- [x] 现有 Markdown 导出行为保持不变。
- [x] 后端测试覆盖 TXT 下载文件名和正文内容格式。

## Out of Scope

- 不新增 TXT 导入能力。
- 不改变项目包导出/导入协议。
- 不改变 Markdown 导出内容结构。
