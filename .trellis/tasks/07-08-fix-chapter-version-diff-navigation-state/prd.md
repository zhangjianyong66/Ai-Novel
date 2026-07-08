# 修复章节版本差异跳转状态回退

## Goal

修复章节版本对比弹窗中“上一个差异 / 下一个差异”导航状态回退的问题。用户在移动端点击“下一个差异”从第 3 处跳到第 4 处后，再次点击“下一个差异”却又回到第 4 处，而不是继续跳到第 5 处。

目标是让按钮点击后的当前差异序号稳定、可预测：用户点击“下一个差异”后，导航状态应以被点击跳转到的目标差异为准，不能被滚动监听误判回前一个仍部分可见的差异。

## Evidence

- 截图：`/home/zhangjianyong/下载/粘贴的图像 (21).png`。
- 用户复现描述：
  - 当前显示第 `3/20` 处。
  - 点击“下一个差异”跳到第 4 处。
  - 再点击“下一个差异”，又跳到第 3/4 附近，实际表现像是状态被滚动同步改回第 3 处。
- 相关代码：
  - `frontend/src/components/writing/ChapterVersionDiffView.tsx`
    - `jumpToDiff()` 先用 `setNavigationState()` 设置目标 ordinal，然后调用 `scrollIntoView({ block: "center" })`。
    - `useEffect()` 内滚动监听在滚动/resize 时调用 `syncCurrentDiffFromScroll()`，重新计算当前 ordinal。
  - `frontend/src/components/writing/chapterVersionDiffNavigation.ts`
    - `findCurrentDiffOrdinalByViewport(anchorY, rects)` 当前使用 `rects.find((rect) => rect.bottom >= anchorY)`，即选取第一个 bottom 仍在 sticky 导航线下方的差异块。

## Root Cause

当前滚动同步算法把“仍部分可见、bottom 未离开 sticky 导航线”的上一个差异块视为当前差异。点击跳转到第 4 处后，如果第 3 处差异块较高或仍有下半部分未滚出导航线，滚动监听会在 `scrollIntoView()` 触发的滚动过程中重新计算并把 `navigationState.ordinal` 从第 4 处改回第 3 处。

之后用户再次点击“下一个差异”时，`jumpToDiff()` 使用已被改回的 `currentDiffOrdinal=3` 作为起点，所以又跳到第 4 处，形成“下一个差异重复跳回上一处/原地循环”的体验。

## Requirements

- R1：按钮点击跳转后，当前差异序号应稳定指向点击目标；即使上一处差异仍部分可见，计数也必须立即保持在目标差异上，直到用户主动滚动到别的位置。
- R2：手动滚动时，当前差异序号仍应能随视口位置更新。
- R3：滚动同步算法应优先识别 sticky 导航下方真正进入阅读焦点的差异块，避免只因上一块 `bottom >= anchorY` 就回退。
- R4：保留循环跳转语义：最后一处点击“下一个差异”回到第一处，第一处点击“上一个差异”回到最后一处。
- R5：保留 reduced motion 行为、当前差异高亮、差异计数、移动端双栏布局和无横向滚动约定。
- R6：新增回归测试覆盖“程序化跳转目标不被滚动同步回退”和“高差异块仍部分可见时继续点击下一处应前进到下一 ordinal”。

## Recommended Fix Direction

推荐优先采用“程序化跳转短暂锁定目标 ordinal + 改进当前差异判定”的组合：

- 在 `jumpToDiff()` 中记录一次 pending/programmatic target ordinal。
- 滚动监听同步时，如果仍处于这次程序化跳转的稳定窗口，避免用上一个仍部分可见的差异覆盖目标 ordinal。
- 同时调整 `findCurrentDiffOrdinalByViewport()` 的判定，不应只取第一个 `bottom >= anchorY`；应考虑 `top <= anchorY`、距离导航线、或块中心/可见区域等更符合“当前阅读焦点”的规则。

不建议只加固定 `setTimeout` 忽略滚动事件；这容易受滚动动画时长、reduced motion、设备性能影响。若需要时间窗口，也应有明确的目标到达条件或最小化的状态锁定边界。

## Acceptance Criteria

- [ ] 从第 3 处点击“下一个差异”跳到第 4 处后，计数保持第 4 处，不会因第 3 处仍部分可见而回退。
- [ ] 在上述状态继续点击“下一个差异”，应跳到第 5 处，而不是重复跳到第 4 处或回到第 3 处。
- [ ] 手动滚动页面时，差异计数仍会根据当前位置更新。
- [ ] `findCurrentDiffOrdinalByViewport` 或新增导航状态模型有单元测试覆盖高块残留可见导致的回退场景。
- [ ] `ChapterVersionDiffView` 相关测试覆盖按钮跳转和滚动同步不互相覆盖的行为；如果当前 Node/Vitest 环境不适合 DOM 滚动事件测试，应抽取纯函数/状态模型测试。
- [ ] `cd frontend && npm test -- src/components/writing/ChapterVersionDiffView.test.tsx` 通过。
- [ ] `cd frontend && npm run lint` 通过。
- [ ] `cd frontend && npm run build` 通过。

## Out of Scope

- 不调整章节版本 API、diff 构建算法或版本数据结构。
- 不重做章节版本抽屉整体 UI。
- 不引入第三方 diff/viewer 组件。

## Notes

- 当前任务先停留在规划阶段；实现前按 Trellis 流程启动任务并读取前端规范。
