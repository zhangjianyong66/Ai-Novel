# 前端类型安全

## 类型组织

- 跨页面共享 API/domain 类型集中在 `src/types.ts`，例如 `Project`、`ChapterDetail`、`LLMProvider`。
- 单个 service 专用类型可以就近定义，例如 `src/services/worldbookApi.ts`。
- API 基础响应类型在 `src/services/apiClient.ts`：`ApiOkPayload<T>`、`ApiErrorPayload`、`ApiError`。
- SSE 消息联合类型在 `src/services/sseClient.ts`。

## API 类型约定

- 调用 `apiJson<T>()` 时，`T` 表示 `data` 字段内部结构，不是完整响应。
- 领域 service 应返回具体业务对象，例如 `fetchChapterDetail(): Promise<ChapterDetail>`。
- 可空后端字段用 `?: T | null` 与现有类型保持一致。
- 后端 snake_case 字段在前端类型中通常保持 snake_case，以匹配 API 契约；只有 Auth 用户这类 UI 模型映射为 camelCase。

## LLM 同步请求超时

- 前端同步等待 LLM 完整结果的 JSON POST 必须使用 `src/lib/llmRequestTimeout.ts` 的 `buildLlmJsonRequestInit`，或继续通过已有的 `buildOutlineGenerateRequestInit` / `buildChapterGenerateRequestInit` 间接使用它。
- 请求超时契约为 `resolveLlmRequestTimeoutMs(timeout_seconds)`，即 `timeout_seconds * 1000 + 60_000`；`timeout_seconds` 缺失时回退 180 秒，浏览器请求超时为 240 秒。
- 适用入口包括非流式大纲/章节生成、章节分析、章节改写、记忆提议、Fractal v2 同步重建、LLM 连接测试等会等待 LLM 返回完整结果的请求。
- 不适用入口包括 SSE 流式生成、只创建后台任务的接口、`prompt_preview` / `generate-precheck` / `graph/query` 等不调用 LLM 的请求，以及 vector embedding/rerank dry-run 这类使用向量专用配置的请求。

正确：

```typescript
await apiJson<Result>(
  `/api/chapters/${chapterId}/rewrite`,
  buildLlmJsonRequestInit({
    headers: { "X-LLM-Provider": preset.provider },
    payload,
    llmTimeoutSeconds: preset.timeout_seconds,
  }),
);
```

错误：

```typescript
await apiJson<Result>(`/api/chapters/${chapterId}/rewrite`, {
  method: "POST",
  body: JSON.stringify(payload),
});
```

## 运行时收窄

后端响应并没有前端 runtime schema 库，当前项目依赖轻量类型守卫和字段检查：

- `apiClient.ts` 先检查 payload 是否 object 且包含 `ok`。
- `sseClient.ts` 对 event payload 的字段逐项 `typeof` 检查。
- `unauthorizedPolicy.ts` 对错误码做字符串 normalize。

新增处理 `unknown` 数据时，先做运行时收窄，再访问字段。不要把外部 JSON 直接 `as SomeType` 后深读。

## 错误类型

- HTTP/API 错误用 `ApiError`，包含 `code`、`message`、`requestId`、`status`、`details`。
- SSE 协议/读取错误用 `SSEError`。
- UI 展示错误时优先显示后端 message 和 request id，方便排查。

## Scenario: 登录用户修改自己的密码

### 1. Scope / Trigger

- Trigger: 前端账户安全页调用后端当前用户改密接口，属于前端表单、service、后端认证 API 的跨层契约。

### 2. Signatures

- Frontend service: `changeOwnPassword(input: { oldPassword: string; newPassword: string }): Promise<void>`
- Backend API: `POST /api/auth/password/change`

### 3. Contracts

- 请求体保持后端 snake_case：`{ old_password: string; new_password: string }`
- 成功响应 data 为空对象，前端不依赖额外字段。
- 前端页面路由为 `/account/security`，只负责当前登录用户自助改密。
- 修改成功后当前会话继续有效，不主动调用 logout 或 refresh。

### 4. Validation & Error Matrix

- 新密码少于 8 位 -> 前端阻止提交，提示“新密码至少 8 位”。
- 确认密码不一致 -> 前端阻止提交，提示“两次输入的新密码不一致”。
- 旧密码错误 -> 后端返回 `ApiError`，前端展示后端 message 和 code。
- 401 且不是“旧密码错误” -> 前端可提示当前账号没有本地密码，避免把第三方登录无本地密码误判为普通旧密码错误。

### 5. Good/Base/Bad Cases

- Good: 本地密码账号输入正确旧密码和一致的新密码，提交成功，表单清空。
- Base: 管理员也通过 `/account/security` 修改自己的密码，不复用管理员重置他人密码入口。
- Bad: 在页面里直接 `fetch` 或拼完整后端 URL；应通过 `apiJson` 和 `changeOwnPassword` service。

### 6. Tests Required

- `validateChangePasswordForm` 覆盖短密码、不一致、有效表单。
- `changeOwnPassword` 覆盖请求路径、HTTP 方法、cookie credentials、snake_case payload。
- 路由元信息测试覆盖 `/account/security` 标题，避免页面标题回退到应用名。

### 7. Wrong vs Correct

#### Wrong

```typescript
await fetch("/api/auth/password/change", {
  method: "POST",
  body: JSON.stringify({ oldPassword, newPassword }),
});
```

#### Correct

```typescript
await apiJson<Record<string, never>>("/api/auth/password/change", {
  method: "POST",
  body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
});
```

## 避免

- 不要使用 `any` 绕过未知 payload；用 `unknown` + type guard。
- 不要让前端类型擅自改字段名，除非有明确 mapper。
- 不要在组件里重复声明与 `src/types.ts` 冲突的领域类型。
