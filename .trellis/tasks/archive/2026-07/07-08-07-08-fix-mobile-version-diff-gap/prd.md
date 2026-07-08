# 修复移动端章节版本对比贴合空隙

## Goal

移动端打开“章节版本”对比时，差异导航条应和 diff 正文区域视觉贴合。用户截图显示，操作按钮下方和差异导航之间仍有一条可见夹层：上一块 diff 内容被 sticky 导航半遮挡并透出，导致界面看起来没有贴合。

本任务目标是修复该残留空隙/叠层问题，让移动端对比模式从顶部操作区到差异导航、再到正文区域形成连续、清晰的阅读结构。

## Background

- 相关截图：`/home/zhangjianyong/下载/粘贴的图像 (20).png`。
- 已有修复已将对比基准选择器移入顶部工具栏，但新截图仍显示 sticky 差异导航上方透出正文内容。
- 当前问题更像是 diff 内容滚动、sticky 导航占位、滚动锚点或间距没有对齐，而不是缺少左右双栏。

## Requirements

- R1：移动端 compare 模式中，操作按钮区下方不应出现半露出的 diff 正文夹层。
- R2：sticky 差异导航应与 diff 正文区域贴合；滚动时不应遮住上一块内容并让内容从导航上方透出。
- R3：保留现有移动端 50/50 左右对比、文本自动换行、无横向滚动方案。
- R4：保留差异计数、上一处/下一处跳转、当前差异高亮、空侧提示和移动端侧标签。
- R5：桌面端章节版本对比布局不得退化。
- R6：测试应覆盖导航与正文结构，避免再次在差异导航上方插入可见正文夹层或过大的垂直间距。

## Acceptance Criteria

- [x] 手机端对比模式下，顶部操作区之后直接进入差异导航和正文内容，不再出现截图红框中的半露出正文/空白夹层。
- [x] 差异导航 sticky 后不会遮住上一块 diff 内容导致内容透出；跳转到差异时目标块不被导航遮挡。
- [x] 版本列表、标题栏、基准选择器、操作按钮仍保持紧凑。
- [x] 相关组件测试覆盖贴合结构回归。
- [x] `cd frontend && npm test -- src/components/writing/ChapterVersionsDrawer.test.tsx src/components/writing/ChapterVersionDiffView.test.tsx` 通过。
- [x] `cd frontend && npm run lint` 通过。
- [x] `cd frontend && npm run build` 通过。

## Out of Scope

- 不调整后端章节版本 API、diff 算法或章节版本数据结构。
- 不重做章节版本抽屉整体交互。
- 不引入第三方 diff/viewer 组件。

## Notes

- 轻量 UI bug，PRD-only 足够；实现前按 Trellis 进入执行阶段并读取前端规范。
