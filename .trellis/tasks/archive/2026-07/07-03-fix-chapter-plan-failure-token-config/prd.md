# 修复章节规划失败处理与 token 配置

## Goal

修复章节生成 `plan_first` 模式的规划步骤行为，使规划输出解析失败时立即中止生成，并让规划 LLM 调用使用模型/任务配置中的 `max_tokens`，避免硬编码 `1024` 导致规划输出被截断。

## Background

- 用户在 `POST /api/chapters/{chapter_id}/generate-stream` 流式生成中看到进度错误：`规划解析失败（TAG_PARSE_ERROR）：未找到 <plan>...</plan> 标签块（将继续生成）`。
- 已查到对应 `generation_runs` 记录：`type=plan_chapter` 的输出开头有 `<plan>`，但没有 `</plan>`，原始输出只有 382 字符，尾部截断在半句话。
- 最近多条 `plan_chapter` 记录均缺少 `</plan>`，说明当前规划输出经常被截断。
- 当前代码在 [backend/app/services/generation_pipeline.py](/home/zhangjianyong/project/Ai-Novel/backend/app/services/generation_pipeline.py:288) 中把规划步骤固定覆盖为 `{"temperature": 0.2, "max_tokens": 1024}`。
- 当前流式接口在 [backend/app/api/routes/chapters.py](/home/zhangjianyong/project/Ai-Novel/backend/app/api/routes/chapters.py:1848) 中把规划解析失败作为 `status="error"` 的进度事件发送，但继续渲染章节提示词并生成正文。
- 输出解析器在 [backend/app/services/output_parsers.py](/home/zhangjianyong/project/Ai-Novel/backend/app/services/output_parsers.py:359) 中要求完整 `<plan>...</plan>` 标签块；只有开标签或输出被截断都应视为解析失败。
- 已检查其他 LLM 调用的 `max_tokens` 使用：
  - 任务预设解析已经通过 [backend/app/services/llm_contract_service.py](/home/zhangjianyong/project/Ai-Novel/backend/app/services/llm_contract_service.py:75) 在配置缺失时使用模型注册表推荐值；[backend/app/services/llm_task_preset_resolver.py](/home/zhangjianyong/project/Ai-Novel/backend/app/services/llm_task_preset_resolver.py:54) 会把该值写入 `PreparedLlmCall.params["max_tokens"]`。
  - 章节正文生成和批量生成使用 [backend/app/services/length_control.py](/home/zhangjianyong/project/Ai-Novel/backend/app/services/length_control.py:14) 按目标字数估算输出上限，不属于本次规划步骤硬编码问题。
  - 章节分析、记忆更新、改写、润色等路径只覆盖 `temperature`，保留配置中的 `max_tokens`。
  - 发现同类“直接覆盖调用 max_tokens”的位置包括：`plan_chapter`、Fractal v2 摘要调用、JSON 修复调用、Outline JSON 修复调用、LLM 测试接口默认 64。
  - 自动更新类服务（角色、图谱、世界书、剧情、表格）存在 2048/1024/512 的重试覆盖，但都会先读取配置值并 `min(limit, configured_max_tokens)`，属于“失败重试时收缩输出”的策略，不会把用户配置较小值放大；是否改成统一策略应作为独立范围评估。

## Requirements

- R1：`plan_first` 模式下，`plan_chapter` 输出解析失败时必须停止本次章节生成，不再继续渲染章节提示词、调用正文生成、后处理或内容优化。
- R2：流式接口应通过 SSE 返回明确失败事件，并结束流；错误信息应包含规划解析失败的错误码和原因，不能再提示“将继续生成”。
- R3：非流式生成路径和独立 `POST /api/chapters/{chapter_id}/plan` 路径也应保持一致：规划解析失败应以错误返回，而不是静默使用空规划。
- R4：`run_plan_llm_step` 不得硬编码覆盖 `max_tokens=1024`。它应保留已解析出的模型配置、项目任务预设或请求头指定配置中的 `max_tokens`。
- R5：如果上游解析出的 LLM 调用参数缺少有效 `max_tokens`，应使用项目已有的统一默认 token 规则，而不是在规划步骤内写死局部常量。
- R6：规划步骤可以继续覆盖 `temperature=0.2`，但不能覆盖调用方已有的 `max_tokens`。
- R7：测试应覆盖解析失败中止生成、规划步骤保留配置 `max_tokens`、缺失 `max_tokens` 使用统一默认值。
- R8：本任务实现时至少修复 `plan_chapter` 的硬编码 `max_tokens`。其他已发现硬编码点先记录为已知问题，除非用户明确扩大范围。

## Acceptance Criteria

- [x] 当 `plan_first=true` 且 `run_plan_llm_step` 返回 `parse_error` 时，`generate-stream` 发送失败 SSE 并结束，不调用章节正文 LLM。
- [x] 错误进度文案不再出现“将继续生成”。
- [x] 非流式 `generate` 的 `plan_first` 分支遇到 `parse_error` 时返回错误，不继续生成正文。
- [x] `POST /api/chapters/{chapter_id}/plan` 遇到 `parse_error` 时返回错误，响应包含可定位的错误码/详情。
- [x] `run_plan_llm_step` 接收到 `PreparedLlmCall.params["max_tokens"]=N` 时，实际传给 `call_llm_and_record` 的仍为 `N`。
- [x] 当 `PreparedLlmCall.params` 没有有效 `max_tokens` 时，规划步骤使用既有统一默认值函数补齐。
- [x] 新增或更新的后端测试可在 `backend/` 下用 `python -m pytest ...` 运行通过。

## Out of Scope

- 不修改 Prompt Studio 的默认提示词内容。
- 不改变 `<plan>...</plan>` 输出契约。
- 不实现规划输出自动修复、补全或重试。
- 不调整正文生成、润色、内容优化的 token 策略，除非测试需要保持现有行为。
- 不在本任务内统一改造 Fractal v2、JSON 修复、Outline 修复、LLM 测试接口或自动更新重试策略；这些调用的输出契约、成本和失败恢复语义不同，应单独设计。
