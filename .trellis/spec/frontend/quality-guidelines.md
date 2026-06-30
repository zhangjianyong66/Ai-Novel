# 前端质量规范

## 运行与检查命令

- 开发：`cd frontend && npm run dev`
- 构建：`cd frontend && npm run build`
- Lint/格式/UI class 检查：`cd frontend && npm run lint`
- 自动修复 lint：`cd frontend && npm run lint:fix`
- 格式化：`cd frontend && npm run format`
- 测试：`cd frontend && npm test`

`npm run lint` 等价于 `eslint . && prettier --check . && node scripts/check-ui-classes.mjs`。

## 编码规则

- TypeScript + React Hooks lint 必须通过。
- 组件和 hook 不要制造未清理 timer、事件监听或请求。
- API 错误必须通过 `ApiError` / toast / request id 可追踪。
- 样式必须优先使用主题 token 和已有组件类。
- 路由页面使用 lazy import，并通过 `importWithChunkRetry` 包装。

## 测试约定

测试使用 Vitest，文件靠近实现：

- 纯工具：`src/lib/requestSeqGuard.test.ts`、`src/lib/routes.test.ts`
- service 行为：`src/services/unauthorizedPolicy.test.ts`、`chapterMarkerStreamParser.test.ts`
- context 逻辑：`src/contexts/authRefreshSchedule.test.ts`
- 页面解析/状态：`src/pages/outlineParsing.test.ts`、`src/pages/importState.test.ts`
- UI 组件：`src/components/ui/ProgressBar.test.tsx`

新增复杂解析、状态机、权限/登出策略、SSE parser、自动保存和导入导出逻辑时，应补对应 Vitest。

## UI 检查

- 长文案、按钮、toast、modal 在窄屏下不能溢出。
- 交互元素要有 focus 样式，优先使用 `ui-focus-ring`。
- 动画必须尊重 reduced motion。
- 图标按钮要有可访问名称。

## 避免

- 不要绕过 `apiClient` 直接 fetch 后端 JSON。
- 不要提交 `dist/`、本地 env 或构建产物。
- 不要新增与 Tailwind token 不一致的一次性颜色体系。
