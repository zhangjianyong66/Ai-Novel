# 前端 Hook 规范

## 命名和职责

- 自定义 hook 使用 `useXxx` 命名，放在 `src/hooks/`。
- hook 负责复用状态逻辑、请求生命周期、浏览器事件和清理；纯函数放 `src/lib/`。
- 返回值应是明确对象类型，例如 `useProjectData<T>` 返回 `ProjectDataResult<T>`。

参考：`src/hooks/useProjectData.ts`、`src/hooks/useAutoSave.ts`、`src/hooks/useProjectTaskEvents.ts`。

## 数据加载

`useProjectData` 是通用项目数据加载模式：

- loader 通过参数传入，hook 内部保存到 ref，避免 effect 频繁重跑。
- 使用 `createRequestSeqGuard()` 防止旧请求覆盖新状态。
- `ApiError` 通过 toast 显示 `message`、`code` 和 `requestId`。
- projectId 缺失时清空数据并停止 loading。

新增类似 hook 时，优先复用 `createRequestSeqGuard`，不要只靠布尔 `mounted` 变量处理竞态。

## 自动保存和事件清理

`useAutoSave` 的约定：

- 保存函数和快照函数写入 ref，避免过期闭包。
- 定时器保存在 ref，并在取消、flush、unmount 时清理。
- `flushOnUnmount` 默认开启，适合编辑器类页面。
- effect 依赖中需要动态列表时，已有代码会局部关闭 exhaustive-deps；新增此类例外必须能说明原因。

## 浏览器 API

- 使用 `window`、`document` 前先判断运行环境是否存在，参考 `AuthProvider`。
- 事件监听必须在 cleanup 中移除。
- AbortController 或 SSE client 暴露的取消能力要在页面离开、重新请求或用户取消时调用。

## 避免

- 不要在 hook 中吞掉所有错误而不通知用户。
- 不要让过期请求更新状态。
- 不要把组件 UI JSX 放入通用 hook；hook 返回状态和命令，UI 由组件渲染。
