# 章节版本比对差异跳转

## Goal

在章节历史版本比对视图中提供“上一个差异 / 下一个差异”快速跳转能力，让用户在长章节双栏差异中不用手动滚动寻找变更位置。

## Confirmed Facts

- 版本比对 UI 由 `frontend/src/components/writing/ChapterVersionDiffView.tsx` 渲染。
- 差异数据由 `frontend/src/lib/chapterVersionDiff.ts` 的 `buildChapterVersionDiff` 生成，块类型包括 `equal`、`changed`、`added`、`removed`。
- 当前比对视图在 `ChapterVersionsDrawer` 的右侧滚动区域内展示，已有基准版本选择区和双栏差异内容。
- 当前组件测试位于 `frontend/src/components/writing/ChapterVersionDiffView.test.tsx`，使用 `renderToStaticMarkup` 检查静态渲染；差异算法测试位于 `frontend/src/lib/chapterVersionDiff.test.ts`。

## Requirements

- 在存在差异时，版本比对视图应提供“上一个差异”和“下一个差异”操作。
- 跳转控件放在 `ChapterVersionDiffView` 内部、双栏版本标签下方、差异块列表上方，作为紧凑工具栏展示。
- 本次跳转控件不做 sticky 固定定位；只提供列表上方的常规工具栏，降低抽屉滚动布局风险。
- 跳转目标只包括 `changed`、`added`、`removed` 块，不包括 `equal` 块。
- 跳转后页面应滚动到目标差异块附近，并给当前差异提供明确的视觉定位状态。
- 操作应在首尾差异处循环跳转：最后一个差异点击“下一个差异”回到第一个，第一个差异点击“上一个差异”回到最后一个。
- 跳转控件应显示当前位置提示，例如“第 N / 共 M 处”，避免循环后用户无法判断当前位置。
- 正文完全一致时保持现有“两个版本正文一致，无差异。”空状态，不展示无效跳转操作。
- 该功能不改变后端接口、版本数据结构或差异算法语义。

## Acceptance Criteria

- [x] 有多个差异块时，用户可以从当前差异跳到下一个差异。
- [x] 有多个差异块时，用户可以从当前差异跳到上一个差异。
- [x] 首尾差异支持循环跳转，并显示当前差异序号与总数。
- [x] 当前差异块有可辨识的高亮/定位状态，且不破坏现有 added/removed/changed 颜色语义。
- [x] 跳转控件位于版本标签和差异列表之间，切换比对内容后状态随组件数据重置。
- [x] 跳转控件不使用 sticky 固定定位。
- [x] 只有一个差异块时，跳转控件不会产生误导性状态。
- [x] 无差异内容不展示跳转控件。
- [x] 前端测试覆盖跳转控件渲染、差异计数或当前定位状态中的关键行为。

## Notes

- 这是轻量前端任务，预计 PRD-only 即可。
- 本任务没有新增 API、配置、环境变量、数据结构或跨层契约，不需要更新 `.trellis/spec/`。
