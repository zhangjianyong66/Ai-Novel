# 修复章节版本差异跳转状态回退实施计划

## Preconditions

- 任务仍处于 `planning`，实现前需要用户确认可以进入开发阶段，再运行 Trellis 任务启动流程。
- 实现前读取前端规范：
  - `.trellis/spec/frontend/component-guidelines.md`
  - `.trellis/spec/frontend/state-management.md`
  - `.trellis/spec/frontend/quality-guidelines.md`

## Checklist

- [x] 启动任务并刷新上下文：检查 `git status --short`，读取本任务 `prd.md`、`design.md`、`implement.md` 和前端规范。
- [x] 扩展 `frontend/src/components/writing/chapterVersionDiffNavigation.ts`：
  - [x] 改进 `findCurrentDiffOrdinalByViewport()` 的当前差异判定。
  - [x] 新增纯函数处理程序化跳转锁与滚动同步结果的合并。
- [x] 扩展 `frontend/src/components/writing/ChapterVersionDiffView.tsx`：
  - [x] 在 `jumpToDiff()` 中记录程序化目标 ordinal。
  - [x] 在滚动同步中应用锁定规则，避免上一处残留可见时覆盖目标 ordinal。
  - [x] 确保 effect cleanup 仍取消 `requestAnimationFrame` 并移除监听。
- [x] 扩展 `frontend/src/components/writing/ChapterVersionDiffView.test.tsx`：
  - [x] 覆盖高块残留可见时的 current diff 选择。
  - [x] 覆盖程序化跳转目标不被滚动同步回退。
  - [x] 覆盖从第 4 处继续点击 next 时能前进到第 5 处的状态模型。
- [x] 运行验证命令并记录结果。

## Validation Commands

- `cd frontend && npm test -- src/components/writing/ChapterVersionDiffView.test.tsx`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`

## Validation Results

- `cd frontend && npm test -- src/components/writing/ChapterVersionDiffView.test.tsx`：通过，15 个测试通过。
- `cd frontend && npm run lint`：通过，ESLint、Prettier check 和 UI class check 均通过。
- `cd frontend && npm run build`：通过，`tsc -b && vite build` 退出码 0；输出包含既有 Browserslist 数据偏旧提示。

## Stop Conditions

- 如果测试环境无法表达程序化滚动状态，先抽取纯状态模型测试，不引入新 DOM 测试依赖。
- 如果发现修复需要改变章节版本抽屉布局、后端接口或 diff block 数据结构，停止实现并回到规划更新范围。
- 如果 lint/build 暴露大量与本任务无关的既有问题，记录命令输出和阻塞点，不扩大修复范围。
