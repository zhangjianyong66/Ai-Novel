# 前端 LLM 请求超时统一修复设计

## 边界

本任务只修改前端浏览器请求超时，不改变后端 LLM 调用超时、任务调度、nginx/frp 超时或 LLM preset 存储结构。

## 请求构造

在 `frontend/src/lib/llmRequestTimeout.ts` 中新增 `buildLlmJsonRequestInit`：

- 固定 `method: "POST"`。
- 序列化 `payload` 为 JSON 字符串。
- 保留调用方传入的自定义 header，例如 `X-LLM-Provider`。
- `timeoutMs` 使用 `resolveLlmRequestTimeoutMs(llmTimeoutSeconds)`。

现有大纲生成和章节生成 helper 继续保留导出 API，但内部委托到通用 helper，降低分散实现。

## 数据流

- 写作页已有项目 LLM preset 状态，章节分析、章节改写、章节生成沿用该状态。
- `MemoryUpdateDrawer` 新增 `llmTimeoutSeconds?: number | null` prop，由写作页或结构化记忆页传入。
- `StructuredMemoryPage` 加载 `/api/projects/{projectId}/llm_preset` 一次，向 `MemoryUpdateDrawer` 和 `CharacterRelationsView` 下传 `timeout_seconds`。
- `CharacterRelationsView` 新增 `llmTimeoutSeconds?: number | null` prop，用于 `/memory/propose`。
- `FractalPage` 加载项目 LLM preset；`mode=llm_v2` 重建使用 LLM 超时，`deterministic` 保持默认 request init。
- Prompts 页 `/api/llm/test` 使用表单中的 `timeout_seconds`，与后端测试调用保持一致。

## 兼容性

`apiJson` 会统一补 `Content-Type: application/json`，helper 返回空 headers 不影响 JSON 请求。未传 `llmTimeoutSeconds` 时回退 `DEFAULT_LLM_TIMEOUT_SECONDS=180`，前端超时为 240 秒。

## 已排除

流式 SSE 生成不新增固定前端 timeout。后台任务创建类接口不延长为 LLM 等待接口。`prompt_preview`、`generate-precheck`、`graph/query` 不调用 LLM，不修改。
