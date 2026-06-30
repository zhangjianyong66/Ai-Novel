# 前端状态管理

## 当前方案

项目使用 React 内建状态管理：

- 全局会话：`src/contexts/AuthContext.tsx` + `src/contexts/auth.ts`
- 全局项目列表：`src/contexts/ProjectsContext.tsx` + `src/contexts/projects.ts`
- 页面/组件局部状态：`useState`、`useMemo`、`useCallback`、`useRef`
- 服务端状态：通过 service 层函数和页面/hook 手动刷新
- URL 状态：React Router path params，路由集中在 `src/App.tsx`

没有 Redux、Zustand、MobX、React Query 或 SWR。

## Context 使用边界

适合 Context：

- 当前登录状态、session refresh、login/register/logout。
- 项目列表和当前项目 shell 需要共享的数据。
- 全局 UI 服务，例如 toast/confirm。

不适合 Context：

- 单页面表单输入。
- 只在一个业务组件树内部使用的筛选、排序、弹窗开关。
- 可由 URL、后端响应或局部派生得到的临时值。

## 服务端状态

- API 请求统一走 `apiJson<T>()`，成功后读取 `res.data`。
- 领域 service 返回页面需要的类型，不把 `ApiOkPayload` 泄露给大多数组件。
- 长连接/流式生成使用 `SSEPostClient`，回调拆分 `onProgress`、`onChunk`、`onResult`、`onDone`、`onError`。
- 401 且错误码为真正鉴权错误时，通过 `ainovel:unauthorized` 事件触发 Auth 状态更新；LLM key 错误不能误登出，测试见 `src/services/unauthorizedPolicy.test.ts`。

## 派生状态

- 派生列表、映射和上下文 value 使用 `useMemo`，参考 `ProjectsProvider`。
- 回调使用 `useCallback`，Provider value 中的函数应稳定。
- 请求竞态使用 `requestSeqGuard`，测试见 `src/lib/requestSeqGuard.test.ts`。

## 避免

- 不要把后端返回对象直接深层 mutation 后 setState。
- 不要因为一个页面需要数据就提升到全局 Context。
- 不要新增并行鉴权状态；`AuthProvider` 是会话状态源。
