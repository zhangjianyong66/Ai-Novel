# 稳定续写与深度记忆模式实施计划

## 前置检查

- 当前任务状态保持 `planning`，在用户审阅 PRD / design / implement 并确认后，才能执行 `task.py start`。
- 实现前读取 `trellis-before-dev`，并按其要求读取相关后端/前端规范。
- 实现时不要修改章节分析写入 `StoryMemory` 的主流程，除非测试暴露与策略解析直接相关的问题。

## 实施步骤

### 1. 后端策略 helper

- 新增 `backend/app/services/memory_strategy.py`。
- 定义策略类型：`off`、`stable`、`deep`、`legacy`。
- 实现：
  - `resolve_memory_strategy(...)`
  - `deep_memory_budget_overrides(...)`
  - 常量：稳定模块、深度默认模块、深度总预算 9000。
- 覆盖逻辑：
  - `off` 所有 section 关闭，包括 `next_requirements`。
  - `stable` 只开 `worldbook`、`tables`、`next_requirements`。
  - `deep` 在 stable 基础上开 `semantic_history`、`foreshadow_open_loops`、`vector_rag`，高级项可打开 `story_memory`、`structured`、`graph`、`fractal`。
  - 未传 `memory_strategy` 时走 legacy。

### 2. 后端请求模型和章节生成接入

- 修改 `backend/app/schemas/chapter_generate.py`：
  - 增加 `memory_strategy: Literal["off", "stable", "deep"] | None = None`。
- 修改 `backend/app/api/routes/chapters.py`：
  - `_resolve_memory_modules` 改为调用策略 helper 或被策略 helper 取代。
  - `_prepare_chapter_memory_injection` 使用策略结果决定是否检索、启用哪些 section、传入哪些 `budget_overrides`。
  - `memory_injection_config` 写入 `strategy`、`budget_total_chars`、`budget_allocations`。
  - `_build_memory_run_params_extra_json` 继续记录旧字段，并附加新策略字段。
- 确认 `memory_retrieval_log_json` 中能看到 section 预算、截断和 token 估算。

### 3. 后端预览接口复用

- 优先不改 `/api/projects/{project_id}/memory/preview` 请求模型。
- 前端预览侧负责把策略解析成 `section_enabled` 和 `budget_overrides`。
- 如果实现发现前后端解析重复明显且风险高，再考虑新增后端 preview 字段 `memory_strategy`，但这应保持兼容，不移除现有字段。

### 4. 前端策略 helper

- 新增 `frontend/src/lib/memoryStrategy.ts`。
- 定义：
  - `MemoryStrategy = "off" | "stable" | "deep"`
  - `DEFAULT_MEMORY_STRATEGY = "stable"`
  - `STABLE_MEMORY_MODULES`
  - `DEEP_MEMORY_DEFAULT_MODULES`
  - `resolveMemoryModulesForStrategy(strategy, advancedModules)`
  - `deepMemoryBudgetOverrides(modules)`
  - `isMemoryEnabled(strategy)`
- 添加 Vitest 纯函数测试，避免依赖 DOM 测试环境。

### 5. 前端生成状态和请求 payload

- 修改 `frontend/src/components/writing/types.ts`：
  - `GenerateForm` 增加 `memory_strategy`。
- 修改 `frontend/src/pages/writing/useChapterGeneration.ts`：
  - 默认策略为 `stable`。
  - 默认模块改为稳定续写组合。
  - 构造生成请求时发送 `memory_strategy`、派生 `memory_injection_enabled`、合成后的 `memory_modules`。
  - 生成结束后如果当前策略是 `deep`，重置为 `stable`。
  - 避免把 `deep` 持久化到 localStorage。

### 6. 前端生成抽屉 UI

- 修改 `frontend/src/components/writing/AiGenerateDrawer.tsx`：
  - 用三段控件替代原“记忆注入”checkbox。
  - 默认文案面向小白：关闭记忆 / 稳定续写 / 深度记忆。
  - `deep` 下显示查询关键词和高级展开项。
  - 高级展开项保留模块勾选；`graph`、`fractal` 默认关闭并提示不建议日常开启。
  - 避免在主界面堆叠过多技术名，技术名放高级项。

### 7. 上下文预览和 Prompt Inspector

- 修改 `frontend/src/components/writing/ContextPreviewDrawer.tsx`：
  - 接收或推导 `memory_strategy`。
  - 用同一前端策略 helper 生成 `section_enabled` 和 `budget_overrides`。
  - 预览 bundle 中记录 `memory_strategy`、模块、预算分配。
  - 显示启用模块、命中条数/字符量、截断状态。
- 修改 `frontend/src/components/writing/PromptInspectorDrawer.tsx`：
  - 请求预览时发送新策略字段和合成模块。
  - 展示策略名，保留旧字段用于调试。

### 8. 测试与质量检查

后端建议新增/更新测试：

- `backend/tests/test_memory_strategy.py`
  - off 关闭所有模块和 `next_requirements`。
  - stable 只开 `worldbook/tables/next_requirements`。
  - deep 默认开 `semantic_history/foreshadow_open_loops/vector_rag`。
  - deep 高级打开 `graph/fractal` 时总预算不超过 9000。
  - legacy 未传 `memory_strategy` 时保持旧行为。

前端建议新增/更新测试：

- `frontend/src/lib/memoryStrategy.test.ts`
  - 三段策略模块合成。
  - 深度记忆预算合成。
  - deep 一次性重置逻辑如能抽纯函数则覆盖。

验证命令：

- 后端局部：`cd backend && python3 -m pytest tests/test_memory_strategy.py`
- 如果新增路由/生成测试：`cd backend && python3 -m pytest tests/<相关文件>`
- 前端 lint：`cd frontend && npm run lint`
- 前端测试：`cd frontend && npm test -- memoryStrategy`

注意：当前项目说明中记录了后端全量 pytest 有既有阻塞；若全量失败，应在最终报告里区分本次相关测试与既有失败。

## 风险点

- `next_requirements` 当前在 `_resolve_memory_modules` 中强制为 `True`，实现 `off` 时必须明确打破这个旧假设。
- `vector_rag` 默认源包含 `story_memory`，稳定续写必须确保 `vector_rag=False`，否则剧情记忆仍可能经向量检索进入 prompt。
- 预览和实际生成必须共用同一策略 helper 或同一映射常量，否则用户看到的预览可能和实际 prompt 不一致。
- 深度记忆是一次性开关，不能被旧 localStorage 逻辑意外持久化。
- 旧客户端兼容需要保留；新前端必须显式发送 `memory_strategy`，不要依赖后端默认。

## 回滚点

- 后端策略 helper 可以通过让新前端暂时不发送 `memory_strategy` 回到 legacy 行为。
- 前端 UI 若出现问题，可先恢复为旧模块勾选 UI，但保留 helper 测试。
- 不涉及数据库迁移，回滚不需要数据修复。
