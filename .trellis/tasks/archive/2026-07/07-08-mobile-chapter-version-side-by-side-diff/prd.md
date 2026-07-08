# 优化移动端章节版本左右对比

## Goal

移动端打开“章节版本”对比时，用户应能清楚看到基准版本与目标版本的左右对照关系，并能完整浏览两侧文本内容。当前手机窄屏下差异块上下堆叠，截图中只能看到一列纵向内容，缺少“左右比对”的视觉语义，且内容区域仍容易被上方版本列表、操作栏、基准选择器挤压。

本任务目标是优化移动端章节版本 diff 的阅读交互：保留对比内容优先，同时恢复明确的双栏对照体验。

## Background

- 相关组件：
  - `frontend/src/components/writing/ChapterVersionsDrawer.tsx`
  - `frontend/src/components/writing/ChapterVersionDiffView.tsx`
  - `frontend/src/components/writing/ChapterVersionDiffView.test.tsx`
  - `frontend/src/components/writing/ChapterVersionsDrawer.test.tsx`
- 已有改动把移动端版本列表压缩为横向短栏，并把差异导航压缩为一行。
- 用户反馈截图显示：移动端对比内容仍呈“基准版本 / 目标版本”纵向卡片列表，不符合左右对比预期，且右侧/目标侧的对应关系不够直观。

## Requirements

- R1：移动端对比模式必须保留清晰的左右对照关系，不能只把基准版本和目标版本上下堆叠成普通列表。
- R2：在手机窄屏下，双栏对比不能撑出页面级横向滚动，也不应依赖 diff 内容区横向滚动；两侧文本应在各自栏内自动换行。
- R3：差异导航、版本列表、基准选择器仍应保持紧凑，避免重新挤占主要 diff 阅读区域。
- R4：桌面端现有左右双栏体验不得退化。
- R5：空侧提示、移动端侧标签、当前差异高亮和上一处/下一处跳转能力应保留。
- R6：新增或调整测试应覆盖移动端无横向滚动的双栏结构，避免后续回归为上下堆叠或横向滚动方案。

## Acceptance Criteria

- [x] 手机端对比内容以左右双栏语义展示；基准版本在左，目标版本在右。
- [x] 手机端如果屏幕宽度不足，两栏保持 50/50 左右布局，文本在栏内自动换行，不出现页面级或 diff 内容区横向滚动。
- [x] 手机端上方版本条、操作栏、基准选择器高度保持紧凑，diff 正文仍是主要可视区域。
- [x] 桌面端仍使用当前双栏对比布局。
- [x] 相关组件测试覆盖移动端无横向滚动双栏容器，并避免使用 `overflow-x-auto` 作为 diff 主方案。
- [x] `cd frontend && npm test -- src/components/writing/ChapterVersionsDrawer.test.tsx src/components/writing/ChapterVersionDiffView.test.tsx` 通过。
- [x] `cd frontend && npm run lint` 通过。
- [x] `cd frontend && npm run build` 通过。

## Out of Scope

- 不调整后端章节版本 API、版本数据结构或 diff 算法。
- 不重做版本抽屉整体信息架构。
- 不引入新的第三方 diff/viewer 组件。

## Recommended Plan

推荐方案：移动端 diff 每个差异块使用“无横向滚动的 50/50 双栏”。基准版本固定在左栏，目标版本固定在右栏；两栏都设置 `min-w-0`、`break-words`、较小内边距和紧凑标签，让长句在栏内换行。相比局部横向滚动，这更符合手机端单手阅读习惯；代价是每栏宽度更窄，长段落会换行更多，因此实现时要压缩卡片间距和标签高度。

## Notes

- 该任务是小范围前端修复，PRD-only 足够；实现前按 Trellis 流程启动任务即可。
