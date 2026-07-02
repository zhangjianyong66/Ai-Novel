# 清理已删除大纲残留伏笔

## Goal

删除大纲或覆盖重建大纲章节后，不再保留由旧章节派生的未回收伏笔，避免伏笔时间线继续展示已经失去来源的大纲内容。

## Background

- 伏笔时间线页面 `frontend/src/pages/ForeshadowsPage.tsx` 请求 `GET /api/projects/{project_id}/story_memories/foreshadows/open_loops`。
- 该接口在 `backend/app/api/routes/memory.py` 查询 `StoryMemory`，筛选 `is_foreshadow = 1` 且 `foreshadow_resolved_at_chapter_id IS NULL`。
- `StoryMemory.chapter_id` 对 `chapters.id` 使用 `ON DELETE SET NULL`，删除章节后记忆不会自动删除。
- `backend/app/api/routes/outlines.py` 删除大纲时会批量删除该大纲下章节；因此旧章节关联的伏笔会变成 `chapter_id = NULL` 的未回收伏笔并继续展示。

## Requirements

- 删除大纲时，应同步移除该大纲下章节派生的 `StoryMemory` 记录，包含其中的未回收伏笔。
- 覆盖创建章节（`bulk_create?replace=true`）时，应同步移除被替换章节派生的 `StoryMemory` 记录，避免旧章节记忆残留到新章节集。
- 单章删除时，应同步移除该章节派生的 `StoryMemory` 记录，保持章节生命周期和章节记忆一致。
- 清理范围只针对 `StoryMemory.chapter_id` 命中被删除章节的记录；不处理用户手动创建且本来没有 `chapter_id` 的项目级记忆。
- 伏笔时间线接口默认只展示仍有关联章节的未回收 StoryMemory 伏笔；历史上已被置空 `chapter_id` 的残留伏笔不再进入该页面。
- 清理后应继续标记向量/搜索索引 dirty，并沿用现有重建调度。

## Acceptance Criteria

- [x] 删除某个大纲后，该大纲下章节关联的未回收 StoryMemory 伏笔不再出现在伏笔时间线接口。
- [x] 覆盖创建章节后，被覆盖旧章节关联的 StoryMemory 不再残留。
- [x] 删除单个章节后，该章节关联的 StoryMemory 不再残留。
- [x] 其他大纲/章节的 StoryMemory 不受影响。
- [x] 已无章节来源的未回收 StoryMemory 伏笔不再出现在伏笔时间线接口。
- [x] 后端回归测试覆盖上述生命周期清理行为。

## Out of Scope

- 不新增手动“清理失效伏笔”按钮。
- 不迁移或删除历史上已经变成 `chapter_id = NULL` 的 StoryMemory；本次先通过接口过滤避免它们污染伏笔时间线。
- 不修改结构化记忆表 `foreshadows` 的数据模型。
