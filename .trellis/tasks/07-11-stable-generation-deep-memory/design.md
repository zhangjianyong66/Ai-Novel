# 稳定续写与深度记忆模式技术设计

## 目标

将章节生成的记忆注入从“一个布尔开关 + 多个技术模块勾选”改为面向用户意图的三段策略：

- `off` / 关闭记忆：不注入任何记忆模块，包括 `next_requirements`。
- `stable` / 稳定续写：默认策略，只注入低风险上下文：`worldbook`、`tables`、`next_requirements`。
- `deep` / 深度记忆：一次性策略，在稳定续写基础上默认额外启用 `semantic_history`、`foreshadow_open_loops`、`vector_rag`，并受 9000 字符额外预算约束。

章节分析后的 `StoryMemory` 写入流程不改变。本任务只调整“生成时是否使用、如何使用记忆”。

## 已比较方案

### 方案 A：只改前端默认模块

把现有 `DEFAULT_GEN_FORM.memory_modules` 改小，例如关闭 `story_memory`、`structured`、`vector_rag` 等。

优点：改动最小。

缺点：产品语义仍然是技术模块列表，小白用户仍需要理解模块；后端仍默认强制 `next_requirements`，无法表达真正的“关闭记忆”；深度记忆的一次性语义和总预算难以落地。

### 方案 B：新增三段策略，复用现有模块和预算机制

新增 `memory_strategy`，后端统一解析为 `section_enabled` 与预算，前端用三段控件表达意图，高级项仍复用现有 `memory_modules`。

优点：用户语义清楚；代码能复用现有 `retrieve_memory_context_pack`、`section_enabled`、`budget_overrides`、预览和日志；兼容旧字段。

缺点：需要触碰前端表单、预览、请求模型和后端解析 helper。

### 方案 C：重做记忆检索预算器

引入真正的全局 token/字符预算器，对所有 section 做统一排序、裁剪、去重。

优点：长期最优。

缺点：范围过大，会牵动 RAG、Graph、Fractal、prompt block budget 和上下文优化器，不适合作为本次 MVP。

本任务采用方案 B。

## 数据契约

### 前端生成表单

在 `GenerateForm` 增加：

```ts
type MemoryStrategy = "off" | "stable" | "deep";
memory_strategy: MemoryStrategy;
```

保留 `memory_modules` 作为高级展开项的底层模块状态。前端发送请求时同时发送：

- `memory_strategy`
- `memory_injection_enabled: memory_strategy !== "off"`，用于兼容现有后端/日志字段
- `memory_modules`：由策略和高级项合成后的模块状态

默认表单：

- `memory_strategy: "stable"`
- `memory_modules.worldbook = true`
- `memory_modules.tables = true`
- `memory_modules.story_memory = false`
- `memory_modules.structured = false`
- `memory_modules.semantic_history = false`
- `memory_modules.foreshadow_open_loops = false`
- `memory_modules.vector_rag = false`
- `memory_modules.graph = false`
- `memory_modules.fractal = false`

打开 `deep` 时，前端默认把本次请求的高级模块合成为：

- 基础稳定模块：`worldbook=true`、`tables=true`
- 深度默认模块：`semantic_history=true`、`foreshadow_open_loops=true`、`vector_rag=true`
- `story_memory=false`、`structured=false`、`graph=false`、`fractal=false`，除非用户在高级展开项中手动打开。

`next_requirements` 不由前端直接控制，由后端策略解析决定。

### 后端请求模型

在 `ChapterGenerateRequest` 增加可选字段：

```py
memory_strategy: Literal["off", "stable", "deep"] | None = None
```

兼容规则：

- 如果 `memory_strategy` 存在，优先按新策略解析。
- 如果 `memory_strategy` 缺失，沿用旧逻辑：`memory_injection_enabled=false` 表示关闭；`true` 时使用传入的 `memory_modules`。这避免破坏外部旧客户端。

### 记忆策略解析

新增共享 helper，例如放在 `backend/app/services/memory_strategy.py`，负责从 `memory_strategy`、`memory_injection_enabled`、`memory_modules` 得到：

- `enabled: bool`
- `strategy: "off" | "stable" | "deep" | "legacy"`
- `section_enabled: dict[str, bool]`
- `budget_overrides: dict[str, int]`
- `budget_total_chars: int | None`
- `budget_allocations: dict[str, int]`

建议策略映射：

```py
OFF = {
  worldbook=False, story_memory=False, next_requirements=False,
  semantic_history=False, foreshadow_open_loops=False,
  structured=False, tables=False, vector_rag=False, graph=False, fractal=False
}

STABLE = {
  worldbook=True, story_memory=False, next_requirements=True,
  semantic_history=False, foreshadow_open_loops=False,
  structured=False, tables=True, vector_rag=False, graph=False, fractal=False
}

DEEP_DEFAULT = {
  worldbook=True, story_memory=False, next_requirements=True,
  semantic_history=True, foreshadow_open_loops=True,
  structured=False, tables=True, vector_rag=True, graph=False, fractal=False
}
```

高级项覆盖只允许在 `deep` 策略下调整深度/高级模块；`off` 不接受覆盖；`stable` 可保持固定，避免“小白默认”被隐藏高级状态污染。

## 深度记忆预算

第一版采用“额外模块预算分配”而不是完整全局排序器。

深度记忆总额外预算：9000 字符。预算只约束深度额外模块，不约束稳定基础模块 `worldbook`、`tables`、`next_requirements`。

默认分配：

- `semantic_history`: 3000
- `foreshadow_open_loops`: 2500
- `vector_rag`: 3500

如果用户在高级项中额外打开 `graph` 或 `fractal`，应从 9000 字符中重新分配，保证所有深度额外模块分配总和不超过 9000。MVP 可使用简单权重：

- `semantic_history`: 3
- `foreshadow_open_loops`: 2.5
- `vector_rag`: 3.5
- `graph`: 2
- `fractal`: 2
- `story_memory`: 2，仅当高级项显式打开
- `structured`: 2，仅当高级项显式打开

按启用模块权重比例向下取整分配，最小单模块预算 1000 字符。这样可以利用现有 `retrieve_memory_context_pack(..., budget_overrides=...)`，避免重写各 section 的格式化逻辑。

日志中应记录 `budget_total_chars=9000` 和各 section 的 `budget_char_limit`，现有 `pack.logs` 已包含每 section 的 `text_chars`、`token_estimate`、`truncated`。

## 后端数据流

章节生成：

1. `ChapterGenerateRequest` 接收 `memory_strategy`、旧字段和 `memory_modules`。
2. `_prepare_chapter_memory_injection` 调用策略 helper。
3. 如果策略为 `off`，返回空的 `_ChapterMemoryPreparation`，并在 `params_json` 里记录 `memory_strategy="off"`。
4. 如果策略为 `stable` 或 `deep`，构建 query text 后调用 `retrieve_memory_context_pack`，传入 `section_enabled` 和 `budget_overrides`。
5. `values["memory"] = pack.model_dump()`，现有 prompt `marker_key` 继续读取 `memory.*.text_md`。
6. `memory_injection_config` 记录 `strategy`、`modules`、`budget_total_chars`、`budget_allocations`、`query_text_source`、`normalized_query_text`。
7. `memory_retrieval_log_json` 继续使用 `build_memory_retrieval_log_json`，必要时扩展 `budgets` 字段。

记忆预览：

现有 `/api/projects/{project_id}/memory/preview` 已支持 `section_enabled` 和 `budget_overrides`。前端上下文预览应使用同一个策略解析逻辑生成这些字段，确保“预览”和“实际生成”一致。

## 前端数据流

主要触点：

- `frontend/src/components/writing/types.ts`
- `frontend/src/pages/writing/useChapterGeneration.ts`
- `frontend/src/components/writing/AiGenerateDrawer.tsx`
- `frontend/src/components/writing/ContextPreviewDrawer.tsx`
- `frontend/src/components/writing/PromptInspectorDrawer.tsx`

建议新增前端 helper，例如 `frontend/src/lib/memoryStrategy.ts`：

- `DEFAULT_MEMORY_STRATEGY = "stable"`
- `STABLE_MEMORY_MODULES`
- `DEEP_MEMORY_DEFAULT_MODULES`
- `resolveMemoryModulesForStrategy(strategy, advancedModules)`
- `deepMemoryBudgetOverrides(modules)`
- `isMemoryEnabled(strategy)`

生成抽屉 UI：

- 用 segmented control 展示 `关闭记忆` / `稳定续写` / `深度记忆`。
- `稳定续写` 显示简短说明：适合日常生成，使用世界书、表格和下一章要求。
- `深度记忆` 显示简短说明：适合查历史、回收伏笔、补细节；本次生成后恢复稳定续写。
- 高级展开项只在 `deep` 下展示或启用，保留模块勾选；`graph`、`fractal` 默认关闭并标注不建议日常开启。
- 原 `memory_query_text` 可保留在 `deep` 下；`stable` 下可隐藏或折叠，因为稳定模式主要不依赖语义召回。

一次性行为：

- 生成请求成功或失败后，如果当前 `memory_strategy === "deep"`，把表单策略重置为 `"stable"`。
- 不再把深度记忆选择写入 localStorage。
- 可保留“关闭记忆/稳定续写”的用户偏好持久化与否作为实现阶段判断；如果保留旧 `memory_injection_enabled` localStorage，应只用于是否从 `"off"` 恢复到 `"stable"`，不能让 `"deep"` 持久化。

## 预览与可观察性

上下文预览应展示：

- 当前策略：关闭记忆 / 稳定续写 / 深度记忆
- 启用模块
- 每 section 的条数或命中数
- 每 section 的字符量、token 估算、截断状态
- 深度记忆总预算 9000 和实际分配

生成历史 debug bundle 已读取 `params.memory_retrieval_log_json` 和 `memory_injection_config`，实现时只需保证新增字段写入 `params_json`。

## 兼容性

- 数据库不需要迁移。
- `StoryMemory` 写入流程不改。
- 旧客户端未传 `memory_strategy` 时保持旧逻辑，降低 API 破坏风险。
- 新前端必须显式传 `memory_strategy`，避免依赖后端默认推断。

## 测试策略

后端：

- 单测策略 helper：`off`、`stable`、`deep`、legacy 映射。
- 单测 `off` 下 `next_requirements=False`。
- 单测 `deep` 默认预算分配总和不超过 9000。
- 单测 `deep` 手动打开 `graph/fractal` 后仍不超过 9000。
- 路由或服务测试确认 `memory_injection_config` 写入 `strategy` 和预算字段。

前端：

- 纯函数测试 `resolveMemoryModulesForStrategy` 和预算 helper。
- ESLint 覆盖生成抽屉、上下文预览、Prompt Inspector 的类型更新。

手工验证：

- 默认打开生成抽屉是 `稳定续写`。
- 切到 `关闭记忆` 后上下文预览无 `worldbook/tables/next_requirements`。
- 切到 `深度记忆` 后预览启用 `semantic_history/foreshadow_open_loops/vector_rag`，并显示预算/截断信息。
- 深度记忆生成后表单回到 `稳定续写`。
