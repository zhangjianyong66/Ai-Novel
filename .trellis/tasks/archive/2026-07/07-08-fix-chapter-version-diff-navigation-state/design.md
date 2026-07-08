# 修复章节版本差异跳转状态回退设计

## Scope

本任务只修改章节版本对比视图的前端导航状态：

- 主要文件：`frontend/src/components/writing/ChapterVersionDiffView.tsx`
- 纯函数文件：`frontend/src/components/writing/chapterVersionDiffNavigation.ts`
- 测试文件：`frontend/src/components/writing/ChapterVersionDiffView.test.tsx`

不修改章节版本 API、diff 数据结构、抽屉整体布局、章节版本保存/激活流程。

## Current Data Flow

1. `ChapterVersionDiffView` 根据 base/target 正文生成 diff blocks。
2. 非 equal block 的 block index 映射为连续 diff ordinal。
3. sticky 导航显示 `currentDiffOrdinal`。
4. 点击“上一个差异 / 下一个差异”时，`jumpToDiff()` 根据 `currentDiffOrdinal` 算出目标 ordinal，更新 `navigationState`，再 `scrollIntoView({ block: "center" })`。
5. 滚动监听通过 `findCurrentDiffOrdinalByViewport(anchorY, rects)` 再次计算当前 ordinal 并写回 `navigationState`。

问题发生在第 5 步：程序化滚动过程中，上一处高差异块可能仍部分位于 sticky 导航线下方，旧算法会把它重新判定为当前块。

## Proposed State Model

引入一个只在组件内部使用的程序化跳转锁：

```ts
type ProgrammaticNavigationLock = {
  diffIdentity: string;
  ordinal: number;
  blockIndex: number;
} | null;
```

设计规则：

- `jumpToDiff()` 在更新 `navigationState` 时同步记录目标锁。
- 滚动同步得到 `nextOrdinal` 后，先检查锁：
  - 如果当前 `diffIdentity` 不匹配，丢弃锁。
  - 如果 `nextOrdinal === lock.ordinal`，说明视口同步已到达目标，保持目标并释放锁。
  - 如果目标 block 已经进入导航线下方的可读焦点区域，但算法仍因为上一块残留可见返回更早 ordinal，则保持锁定目标，不回退。
  - 如果用户滚动到目标之前或之后的明显位置，允许释放锁并接受滚动同步结果。
- 锁应使用 `useRef`，避免为锁本身制造额外 render；公开 UI 状态仍由 `navigationState` 驱动。

这里的“目标 block 进入焦点区域”应通过 rect 判断，而不是固定时间。固定时间只能作为兜底时长，不作为主要正确性机制。

## Viewport Selection Rule

调整 `findCurrentDiffOrdinalByViewport()`，使其更贴近阅读焦点：

- 输入仍是 `anchorY` 和按文档顺序排列的 rects。
- 优先选择包含 anchor line 的 block，但当多个高块/相邻块都与 anchor 附近相关时，应以距离 anchor line 最近的 `top` 或中心点为依据，避免仅凭 `bottom >= anchorY` 选择上一个残留块。
- 如果 anchor line 在第一块之前，返回第一块。
- 如果 anchor line 在最后一块之后，返回最后一块。

建议把判断拆成纯函数，覆盖以下场景：

- anchor 位于某块内部，返回该块。
- 上一块很高且 bottom 仍超过 anchor，但下一块 top 已更接近 anchor，返回下一块。
- anchor 位于所有块之前或之后时返回最近边界块。

## Compatibility

- 保留 reduced motion：`scrollIntoView` 的 `behavior` 继续由 `prefersReducedMotion()` 决定。
- 保留循环跳转：`next` 从最后一处回第一处，`previous` 从第一处回最后一处。
- 保留现有 mobile sticky 导航布局和不透明背景，不能重新引入 `overflow-x-auto` 或顶部 padding 问题。
- 保留 `aria-current="location"` 和计数展示。

## Testing Strategy

由于当前 Vitest 配置主要使用 Node 环境，优先覆盖纯函数和可 SSR 的组件输出：

- 在 `chapterVersionDiffNavigation.ts` 中抽取/新增纯状态函数，模拟“点击目标为第 4 处，滚动算法短暂返回第 3 处”的场景。
- 扩展 `findCurrentDiffOrdinalByViewport()` 单元测试，覆盖高块残留可见时不回退。
- 保留现有 `renderToStaticMarkup` 组件测试，确认导航和布局 class 没被破坏。

如果实施时发现需要真实 DOM 滚动事件测试，先评估是否引入浏览器 DOM 测试环境；默认不为本小修引入新测试依赖。

## Risks And Rollback

- 风险：锁释放条件过严会导致用户手动滚动后计数不更新。
- 防护：锁只在程序化跳转后存在，并在目标到达、identity 变化或用户滚动到明显非目标位置时释放。
- 回滚点：所有改动集中在 `ChapterVersionDiffView.tsx` 与 `chapterVersionDiffNavigation.ts`，回滚不会影响后端或数据结构。
