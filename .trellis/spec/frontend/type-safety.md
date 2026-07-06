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

## 避免

- 不要使用 `any` 绕过未知 payload；用 `unknown` + type guard。
- 不要让前端类型擅自改字段名，除非有明确 mapper。
- 不要在组件里重复声明与 `src/types.ts` 冲突的领域类型。
