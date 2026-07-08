# 前端移动端兼容优化执行计划

## 阶段 1：基线检查

- [x] 启动前端或 Docker 环境，记录当前核心页面在 390x844 和桌面宽度下的主要问题。
- [x] 检查 `AppShell`、`Drawer`、`Modal`、全局 CSS 中可能导致页面级横向滚动的布局约束。
- [x] 确认首批页面的主要容器和高风险区域。

## 阶段 2：全局基础设施

- [x] 优化 `AppShell` 移动端导航抽屉、顶部栏和页面容器。
- [x] 优化通用 `Drawer` 手机端宽高、滚动和底部安全区。
- [x] 优化通用 `Modal` 手机端宽高和滚动。
- [x] 补齐按钮组、表单、长文本的基础移动端约束。

## 阶段 3：核心页面

- [x] 优化 `DashboardPage` 项目列表和主操作在手机端的布局。
- [x] 优化 `WritingPage` 主编辑视图、章节列表抽屉、工具栏和关键 overlays。
- [x] 优化 `OutlinePage` 大纲编辑、生成弹窗/抽屉、章节列表的手机端布局。
- [x] 优化 `PromptsPage` 主模型配置表单和任务预设区域的手机端布局。

## 阶段 4：全站兜底

- [x] 扫描高级页面的页面级横向溢出。
- [x] 为复杂表格、调试面板、宽内容区域补局部滚动容器。
- [x] 避免把高级页面一次性重构为卡片。

## 阶段 5：验证

- [x] 运行 `cd frontend && npm run lint`。
- [ ] 在 390x844 检查 `DashboardPage`、`WritingPage`、`OutlinePage`、`PromptsPage`。
- [ ] 在桌面宽度检查同一批页面无布局回归。
- [ ] 如条件允许，加入或运行轻量脚本化横向溢出冒烟检查。

验证备注：

- `cd frontend && npm run lint` 已通过。
- `cd frontend && npm run build` 已通过。
- `cd frontend && npm test` 已通过。
- Vite 开发服务已在 `http://127.0.0.1:5174/` 启动；默认 `5173` 已被占用。
- CDP 浏览器截图验证未完成：系统已有 Chrome 进程，但未开放 9222/9333 远程调试端口，`start_chrome_cdp` 无法启动新的可控实例。未终止用户进程。

## 风险文件

- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/components/ui/Drawer.tsx`
- `frontend/src/components/ui/Modal.tsx`
- `frontend/src/pages/DashboardPage.tsx`
- `frontend/src/pages/WritingPage.tsx`
- `frontend/src/pages/writing/WritingPageSections.tsx`
- `frontend/src/pages/OutlinePage.tsx`
- `frontend/src/pages/PromptsPage.tsx`
- `frontend/src/index.css`

## 启动实现前检查

- [ ] 用户确认 `prd.md`、`design.md`、`implement.md`。
- [ ] 加载 `trellis-before-dev` 并读取前端相关规范。
- [ ] 执行 `python3 ./.trellis/scripts/task.py start 07-08-frontend-mobile-compat` 后再写业务代码。
