# 前端 LLM 请求超时统一修复执行计划

## 步骤

- [x] 读取前端规范和共享规范。
- [x] 为 `llmRequestTimeout` 通用 helper 写失败测试并确认失败。
- [x] 实现 `buildLlmJsonRequestInit`，迁移大纲/章节生成 helper。
- [x] 修复章节分析和章节改写请求超时。
- [x] 修复 `MemoryUpdateDrawer`、`StructuredMemoryPage`、`CharacterRelationsView` 记忆提议请求超时。
- [x] 修复 `FractalPage` 的 `llm_v2` 重建请求超时。
- [x] 修复 Prompts 页 `/api/llm/test` 浏览器请求超时。
- [x] 审计剩余疑似同步 LLM 请求，确认不改项。
- [x] 运行 targeted Vitest、前端构建、Prettier check、`git diff --check`。

## 验证命令

```bash
cd frontend && npm test -- src/lib/llmRequestTimeout.test.ts src/pages/outline/outlineGenerateRequest.test.ts src/pages/writing/chapterGenerateRequest.test.ts
cd frontend && npm run build
cd frontend && npx prettier --check src/lib/llmRequestTimeout.ts src/lib/llmRequestTimeout.test.ts src/pages/outline/outlineGenerateRequest.ts src/pages/writing/chapterGenerateRequest.ts src/pages/writing/useChapterAnalysis.ts src/components/writing/MemoryUpdateDrawer.tsx src/pages/StructuredMemoryPage.tsx src/pages/structuredMemory/CharacterRelationsView.tsx src/pages/FractalPage.tsx src/pages/prompts/usePromptsPageState.ts
git diff --check
```

## 风险点

- `MemoryUpdateDrawer` 有多个 `/memory/propose` 调用，必须全部替换。
- `FractalPage` 只有 `mode=llm_v2` 需要延长超时，确定性重建不应被误归类为 LLM 请求。
- Prompts 页测试连接要先保存 `timeoutSeconds` 变量，再同时用于 payload 和 request init，避免重复解析造成不一致。
