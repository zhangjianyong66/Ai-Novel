# 前端移动端兼容优化实施计划

## Checklist

1. 读取前端规范
   - `.trellis/spec/frontend/index.md`
   - `.trellis/spec/frontend/component-guidelines.md`
   - `.trellis/spec/frontend/quality-guidelines.md`

2. 建立风险清单
   - 扫描 `frontend/src/components/layout/AppShell.tsx`。
   - 扫描写作页相关文件：`WritingPageSections.tsx`、`WritingToolbar.tsx`、写作页抽屉组件。
   - 扫描大纲、阅读、预览、首页的固定宽度和浮动元素。
   - 扫描宽表格页面，确认是否已有局部 `overflow-x-auto`。

3. 修复全局框架
   - 移动导航抽屉可滚动并适配窄屏宽度。
   - 页面 header 标题和右侧操作在手机端不挤破容器。
   - 主内容容器不产生 body 级横向滚动。

4. 修复写作页核心流程
   - 工具条选择框、章节按钮、生成/工具按钮在手机端可换行或全宽。
   - 编辑器头部状态和动作区在手机端不溢出。
   - 章节列表抽屉高度、宽度和关闭操作可用。
   - 写作页常用抽屉/弹窗在手机端可滚动、可关闭。
   - 浮动生成卡片和底部向导条不遮挡关键编辑操作。

5. 修复大纲、阅读/预览、首页阻断问题
   - 大纲页操作条、生成弹窗、底部向导条检查并修复。
   - 阅读/预览页章节列表抽屉和阅读内容检查并修复。
   - 首页项目卡片、导入弹窗、创建项目弹窗检查并修复。

6. 处理宽表格和高级页的容器级溢出
   - 对必须保留宽表格的页面加局部横向滚动容器。
   - 不做复杂高级页移动信息架构重排。

7. 验证
   - `cd frontend && npm run lint`
   - 必要时 `cd frontend && npm run build`
   - 启动开发服务，在 375px 宽度检查核心路径。

## Review Gates

- 修复前先确认每个改动属于 PRD 核心路径或容器级防溢出。
- 每批 class 调整后检查是否影响桌面断点。
- 完成后运行 lint；若 lint 失败，先修复本次改动引入的问题。

## Risky Files

- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/pages/writing/WritingPageSections.tsx`
- `frontend/src/components/writing/WritingToolbar.tsx`
- `frontend/src/components/atelier/WizardNextBar.tsx`
- 写作页多个 Drawer/Modal 调用组件

## Rollback Points

- 全局框架改动独立于页面改动提交前检查。
- 写作页工具条和编辑器头部改动独立检查。
- 宽表格容器级改动不和核心路径布局重构混在一起。
