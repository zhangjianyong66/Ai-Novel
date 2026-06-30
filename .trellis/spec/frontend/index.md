# 前端开发规范

前端位于 `frontend/`，技术栈是 React 19 + Vite 7 + TypeScript + Tailwind CSS，运行时通过 `/api` 代理访问后端。

## 必读清单

- [目录结构](./directory-structure.md)：页面、组件、hooks、services、lib、types 的放置规则。
- [组件规范](./component-guidelines.md)：Tailwind token、基础 UI、弹窗/toast、可访问性。
- [Hook 规范](./hook-guidelines.md)：数据加载、自动保存、请求竞态和清理。
- [状态管理](./state-management.md)：Context、本地状态、服务端状态、URL 状态。
- [类型安全](./type-safety.md)：API 类型、错误类型、运行时收窄。
- [质量规范](./quality-guidelines.md)：运行、构建、lint、测试和 UI class 检查。

## 常用命令

- 安装依赖：`cd frontend && npm install`
- 开发启动：`cd frontend && npm run dev`
- 构建：`cd frontend && npm run build`
- Lint/格式检查：`cd frontend && npm run lint`
- 测试：`cd frontend && npm test`
- 预览构建：`cd frontend && npm run preview`

## 重要约定

- Vite dev server 固定监听 `127.0.0.1`，端口来自 `VITE_DEV_PORT` 或默认 `5173`。
- `/api` 代理目标来自 `VITE_API_PROXY_TARGET` 或默认 `http://127.0.0.1:8000`。
- API 调用通过 `src/services/apiClient.ts`，SSE POST 通过 `src/services/sseClient.ts`。
- 样式优先使用 `src/index.css` 中的 `btn`、`input`、`textarea`、`ui-focus-ring` 等组件类和 Tailwind 主题 token。
- 不要绕过 `ApiError`、`ToastProvider`、`ConfirmProvider` 自造并行错误/提示体系。
