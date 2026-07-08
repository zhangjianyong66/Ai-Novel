# 修复记忆更新提议跨章节应用

## Goal

修复写作页记忆更新抽屉在切换章节后仍保留上一章节提议结果的问题，避免用户在第二章应用第一章的旧记忆提议。系统应在前端阻止旧提议跨章节复用，并在后端对手工/前端提交的变更条目做章节归属校验。

## Background

- 用户反馈：“记忆更新 一键生成提议 似乎没有包含第二章的内容，第二章已经设置定稿。”
- 排查确认第二章 `79daf4d8-c746-44ce-b06b-28a4c13f6da6` 是 `done`，正文长度 `5586`。
- 最近第二章 Auto Propose `request_id=ce539866-568b-430d-add9-5bde9a541c47` 的 LLM prompt 包含 `chapter_number: 2`、`chapter_title: 鼓面余震` 和 `# 第二章 鼓面余震` 正文。
- Auto Propose 生成的 change_set `744ecd51-e767-462c-96d1-90d7fd54f8aa` 有 17 条第二章条目，其中 9 条引用第二章 ID，0 条引用第一章 ID。
- 随后被应用的第二章 change_set `fd597d01-e0de-45c7-9bf4-8cd885c67ed7` 与第一章已应用 change_set `fbd2c109-fe39-4315-9443-a75f6f4a85e9` 的 30 条完全相同；该 applied change_set 0 条引用第二章，12 条引用第一章。
- 前端 `MemoryUpdateDrawer` 的 `proposeResult` 没有在 `chapterId` 变化时清空，`runApplyAccepted` 会把旧 `proposeResult.items` 用当前 `chapterId` 重新提交到 `/api/chapters/{chapterId}/memory/propose`。

## Requirements

- R1：当 `MemoryUpdateDrawer` 的 `chapterId` 变化或抽屉重新打开到不同章节时，必须清空上一章节的 `proposeResult`、`accepted`、`applyResult`、`applyError`、`lastApplyChangeSetId` 等章节绑定状态。
- R2：用户不能在当前章节上应用来自其他章节的提议结果；前端应确保“应用已接受项”只使用当前章节新生成的提议。
- R3：后端 `POST /api/chapters/{chapter_id}/memory/propose` 在接收 ops 时，应拒绝明显属于其他章节的条目，避免手工 JSON 或前端状态 bug 绕过前端保护。
- R4：章节归属校验至少覆盖 `events.chapter_id`、`foreshadows.chapter_id` / `resolved_at_chapter_id`、`evidence.source_type=chapter` 且 `source_id` 为章节 ID 的场景。
- R5：保留当前合法用法：同一章节 Auto Propose 后直接应用应继续成功；手工 JSON 无章节 ID 的通用实体/关系更新不应被误拒。
- R6：保留上一轮结构化记忆 relation 实体引用防线，不回退已有修复。

## Acceptance Criteria

- [ ] 前端测试覆盖：`chapterId` 变化后，旧 `proposeResult` 不再可应用，UI 显示需要先重新生成提议。
- [ ] 后端测试覆盖：对章节 2 提交包含章节 1 `events.chapter_id` 或 chapter evidence `source_id` 的 ops 时返回 `VALIDATION_ERROR`，不创建 change_set。
- [ ] 后端测试覆盖：对目标章节自身的 event/evidence ops 仍可 propose 成功。
- [ ] `frontend` lint 通过，或至少本次触碰文件的 ESLint/Prettier 检查通过并说明未跑全量的原因。
- [ ] `backend` 记忆更新相关单测通过。

## Notes

- 这是轻量 bugfix，PRD-only 足够；执行前仍需读取前后端开发规范。
- 当前工作区已有上一轮相关后端修复未提交，本任务实现时不得回退这些改动。
