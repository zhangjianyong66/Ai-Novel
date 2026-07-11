# 稳定续写与深度记忆模式

## Goal

让章节生成默认以“稳定续写、不跑偏”为优先目标，避免每次生成都被长期剧情记忆、伏笔、向量检索、图谱或分形摘要过度牵引；同时保留一个面向特定章节的一次性“深度记忆”开关，用于需要查历史、回收伏笔或补细节的场景。

用户是 AI agent 小白，不应被迫理解 `story_memory`、`semantic_history`、`vector_rag`、`graph`、`fractal` 等底层模块差异；默认体验应尽量少而准，高级能力应可展开查看和调整。

## Confirmed Facts

- 当前章节分析应用后会把分析结果写入 `StoryMemory`，包括 `chapter_summary`、`hook`、`plot_point`、`foreshadow`、`character_state`、`continuity_fact`、`next_requirement` 等类型；同一章节重跑会删除该章受管类型后重建，避免同章无限重复。证据：`backend/app/services/plot_analysis_service.py:422`、`backend/app/services/plot_analysis_service.py:744`。
- 当前章节生成并非全量注入所有 `StoryMemory`；普通 `story_memory` 会按项目/当前大纲作用域过滤、排除 `next_requirement`，按关键词/重要度/更新时间取候选，最终用于 prompt 的条目限制为最多 12 条且默认 6000 字符预算。证据：`backend/app/services/memory_retrieval_service.py:379`。
- `next_requirement` 单独处理，只注入目标章节号等于当前章节的要求，适合保留为稳定续写默认上下文。证据：`backend/app/services/memory_retrieval_service.py:443`。
- 当前前端生成表单默认开启 `memory_injection_enabled`，并默认开启 `worldbook`、`story_memory`、`structured`、`tables`、`vector_rag`、`graph`、`fractal`；默认关闭 `semantic_history` 和 `foreshadow_open_loops`。证据：`frontend/src/pages/writing/useChapterGeneration.ts:82`。
- 当前 `vector_rag` 默认检索源包含 `story_memory`，因此即使普通 `story_memory` 模块不是唯一入口，剧情记忆仍可能通过向量检索进入上下文。证据：`backend/app/services/vector_rag_service.py:48`、`backend/app/services/memory_retrieval_service.py:823`。
- 提示块支持通过 `marker_key` 从 `values` 点路径读取 `memory.*.text_md` 并注入最终 prompt，空模板文件不代表空注入。证据：`backend/app/services/prompt_presets.py:616`。

## User Decisions

- 默认目标选择“生成质量稳定、不跑偏”，优先于“尽可能记住所有伏笔和细节”。
- 可以接受默认不主动召回远古伏笔，只在手动开启深度记忆时召回。
- 可以接受默认只注入最近上下文，但需要保留手动开关。
- 深度记忆采用一个总开关，下面保留高级展开项。
- 深度记忆默认启用 `semantic_history`、`foreshadow_open_loops`、`vector_rag`。
- 稳定续写模式下普通 `story_memory` 默认关闭，但 `next_requirement` 继续自动注入。
- 章节分析后仍继续自动写入 `StoryMemory`，但生成阶段默认不滥用这些记忆。
- 稳定续写模式下 `tables` 默认开启，`structured` 默认关闭。
- 深度记忆必须有严格总预算上限，避免多个模块各自塞满上下文。
- 深度记忆第一版默认总预算为 9000 字符，暂不做按模型上下文窗口动态计算。
- 深度记忆开启时展示本次注入预览，但不强制逐条确认。
- 深度记忆是一次性开关，生成结束后回到稳定续写模式，不持久记住为后续章节默认开启。
- 章节生成原“记忆注入”总开关改为三段模式：`关闭记忆`、`稳定续写`、`深度记忆`；默认选择 `稳定续写`。
- 深度记忆高级展开项保留 `graph` 和 `fractal` 供手动开启，但默认关闭，并显示不建议日常开启的提示。
- `关闭记忆` 模式应关闭所有记忆注入，包括 `next_requirement`；只保留基础章节上下文、当前章节计划和用户指令。

## Requirements

- R1：章节生成默认应进入“稳定续写模式”，以较少、明确、当前相关的上下文为主。
- R1a：章节生成 UI 应使用三段模式表达记忆策略：`关闭记忆`、`稳定续写`、`深度记忆`。
- R1b：`关闭记忆` 模式必须语义清晰，不注入 `worldbook`、`tables`、`next_requirements` 或任何长期记忆模块。
- R2：稳定续写和深度记忆模式默认开启 `worldbook`、`tables` 和 `next_requirements`。
- R3：稳定续写模式默认关闭普通 `story_memory`、`structured`、`semantic_history`、`foreshadow_open_loops`、`vector_rag`、`graph`、`fractal`。
- R4：保留章节分析后的 `StoryMemory` 自动写入能力，不因为默认关闭注入而停止沉淀记忆资产。
- R5：章节生成 UI 应提供一个面向小白用户的“深度记忆”总开关；打开后默认启用 `semantic_history`、`foreshadow_open_loops`、`vector_rag`。
- R6：深度记忆开关应为一次性本次生成开关，不应像当前 `memory_injection_enabled` 一样跨章节/跨生成持久保持开启。
- R7：深度记忆下仍应保留高级展开项，允许用户查看和调整底层模块。
- R7a：高级展开项应保留 `graph` 和 `fractal`，但默认关闭，并用文案提示它们适合调试或特定项目，不建议日常默认开启。
- R8：深度记忆必须有总预算上限，限制额外注入内容总量，避免多个模块叠加造成上下文爆炸。
- R8a：深度记忆第一版总预算默认 9000 字符；超出预算的内容应截断并记录截断状态。
- R9：生成前或上下文预览中应能看见本次记忆注入摘要，包括启用模块、召回条数、额外字符数、截断状态和关键来源类型。
- R10：生成历史/调试信息应继续保留 `memory_injection_config` 和 `memory_retrieval_log_json`，便于排查生成跑偏是否由记忆注入导致。
- R11：UI 文案应避免要求普通用户理解 RAG、Graph、Fractal 等术语；高级项可以保留原模块名和说明。

## Acceptance Criteria

- [ ] 默认打开章节生成抽屉时，普通用户看到的是稳定续写默认组合；普通 `story_memory`、`structured`、`semantic_history`、`foreshadow_open_loops`、`vector_rag`、`graph`、`fractal` 不再默认参与生成。
- [ ] 章节生成 UI 使用三段模式，默认选中 `稳定续写`；`关闭记忆` 不注入世界书、表格、`next_requirements` 或长期记忆，`深度记忆` 是本次生成的一次性增强。
- [ ] `next_requirements` 在稳定续写和深度记忆模式下默认启用，且只注入目标章节号匹配当前章节的要求；关闭记忆模式下不注入。
- [ ] 章节分析或章节定稿后的自动记忆写入流程不被关闭，已有 `StoryMemory` 写入、同章受管记忆重建、vector dirty 标记等行为保持可用。
- [ ] 用户打开“深度记忆”后，本次生成默认会启用 `semantic_history`、`foreshadow_open_loops`、`vector_rag`，并能在高级展开项中查看/调整模块。
- [ ] 深度记忆高级展开项里可手动开启 `graph` 和 `fractal`，但它们默认关闭且带有不建议日常开启的说明。
- [ ] 深度记忆生成完成后，新建下一次生成表单应回到稳定续写默认，不自动保持深度记忆开启。
- [ ] 深度记忆额外注入内容受总预算控制；当召回内容超过预算时，系统应截断并在预览/日志中显示截断状态。
- [ ] 未显式配置预算时，深度记忆额外注入预算默认为 9000 字符。
- [ ] 上下文预览或生成前摘要能展示本次启用模块、召回条数、字符量和截断状态。
- [ ] `generation_runs` 调试信息仍能看到本次记忆注入配置和每个 section 的检索日志。
- [ ] 前端 lint 通过；后端相关记忆检索/生成配置单测或等价测试覆盖默认模块组合、深度记忆组合、预算和一次性开关行为。

## Out of Scope

- 不重新设计章节分析 prompt 本身。
- 不停止或删除 `StoryMemory` 自动写入。
- 不在本任务内实现长期记忆自动合并、自动淘汰、重要度学习或全书级记忆压缩。
- 不移除高级模块；本任务只调整默认模式、总开关、预算和预览。
