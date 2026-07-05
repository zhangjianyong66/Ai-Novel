# 修复 AI 生成大纲后前端未切换到新大纲

## Goal

AI 生成大纲成功后，后端已经立即保存新大纲到数据库；前端大纲页必须刷新页面数据并自动切换到最新生成的大纲，让用户立即看到新大纲内容，并能直接基于该大纲继续创建章节骨架。

## Confirmed Facts

- 后端 `POST /api/projects/{project_id}/outline/generate` 和 `POST /api/projects/{project_id}/outline/generate-stream` 在最终结果可用、无 `parse_error` 且存在有效章节时，会调用 `_save_generated_outline_if_usable` 自动创建新 `Outline`，并把 `project.active_outline_id` 更新为新大纲 ID。
- 后端生成响应会在成功自动保存时返回 `saved_outline`，其中包含新大纲的 `id`、`title`、`content_md` 和 `structure`。
- 前端 `useOutlineGenerationState.persistGeneratedOutline` 检测到 `result.saved_outline` 后，目前只调用 `refreshSavedOutline()`。
- 前端 `useOutlinePageState.refreshSavedOutline` 目前只执行 `refreshOutline()` 和 `refreshWizard()`，没有把 `saved_outline.id` 作为期望目标，也没有用 `saved_outline` 对本地 `activeOutline`、`outlines`、`baseline`、`content` 做立即同步。
- 大纲页选择器的当前值来自 `activeOutline?.id`；编辑器内容来自 `content`；章节骨架来源优先使用生成预览，弹窗成功后会清空预览，因此主页面必须可靠切到新保存的大纲。
- 用户已确认本次问题范围是前端页面数据刷新和切换到最新大纲；后端保存流程不需要改动。
- 用户要求：如果当前页面大纲存在未保存修改，生成完成后自动切换到新大纲前应弹窗提示，由用户选择“保存后切换”或“直接切换”。
- 用户确认复用现有手动切换大纲的未保存修改确认弹窗；现有文案为 `OUTLINE_COPY.confirms.switchOutline`，按钮语义是“保存并切换 / 不保存切换 / 取消”。

## Requirements

- 生成成功且后端返回 `saved_outline` 时，前端必须把页面当前大纲切换为该 `saved_outline`。
- 如果当前编辑器存在未保存修改，前端在切换到 `saved_outline` 前必须弹窗确认，允许用户选择保存当前修改后切换，或放弃当前修改直接切换。
- 未保存修改弹窗必须复用现有手动切换大纲确认逻辑和文案，避免生成后切换与手动切换出现两套交互规则。
- 如果用户选择保存后切换但保存失败，必须停留在当前大纲，保留生成结果的恢复路径，不应静默切换。
- 切换结果必须同步影响顶部“当前大纲”选择器、主编辑器 Markdown 内容、`dirty`/`baseline` 状态，以及“从大纲创建章节骨架”的章节来源。
- 支持非流式生成、流式生成、流式失败后回退非流式生成这三条路径。
- 如果后端未返回 `saved_outline`，保持现有恢复路径：保留生成预览，允许重试保存为新大纲和复制结果。
- 如果刷新或本地同步失败，不应丢失生成结果；必须提示保存/切换失败，并保留用户可恢复的预览。
- 不改变后端自动保存语义：只有最终结果存在至少 1 个有效章节且没有 `parse_error` 时保存一次；章节骨架仍由用户显式触发。
- 本次优先修复大纲页生成后的切换一致性，不引入历史 `generation_runs` 恢复入口。
- 本次不修改后端保存接口、数据库结构、自动保存条件或大纲标题生成规则。

## Acceptance Criteria

- [x] 非流式生成返回 `saved_outline` 后，弹窗关闭，顶部选择器选中新大纲，编辑器显示新大纲内容，页面不显示未保存状态。
- [x] 若生成完成时当前页面仍有未保存修改，切换前弹窗提示；选择保存后切换时先保存旧大纲再切到新大纲，选择直接切换时放弃旧修改并切到新大纲。
- [x] 若保存旧大纲失败，页面不切换到新大纲，并保留生成结果恢复路径。
- [x] 流式生成最终返回 `saved_outline` 后，表现与非流式一致；中途的部分预览不会落库或切换主编辑区。
- [x] 流式连接失败且回退非流式生成成功时，表现与非流式一致。
- [x] 生成结果不可自动保存或自动保存刷新失败时，生成预览仍保留，用户可重试保存或复制结果。
- [x] 覆盖关键前端状态同步逻辑的测试，防止只刷新但未切换的回归。

## Notes

- 相关前端文件：`frontend/src/pages/outline/useOutlinePageState.ts`、`frontend/src/pages/outline/useOutlineGenerationState.ts`、`frontend/src/pages/outlineParsing.ts`。
- 后端文件 `backend/app/api/routes/outline.py` 仅作为现有契约依据，非本次预期修改范围。
