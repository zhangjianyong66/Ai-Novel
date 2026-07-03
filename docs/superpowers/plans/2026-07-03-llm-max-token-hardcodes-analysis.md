# LLM 固定 max token 场景逐项分析计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 逐个分析当前项目中仍然存在固定 `max_tokens` / `max_output_tokens` 数值的 LLM 请求场景，判断哪些应保留、哪些应改为配置化或能力感知。

**架构:** 本计划先做只读分类，再按场景补测试和最小改动。初始请求参数优先保留用户配置或任务预设；只有明确属于连接测试、provider 兼容重试、模型能力上限保护或目标字数估算的场景，才允许继续使用固定或派生数值。

**技术栈:** FastAPI 后端、Python、pytest、现有 LLM provider 适配层、`PreparedLlmCall` / `with_param_overrides` / `call_llm_and_record_with_retries`。

---

## 背景结论

本计划来自 2026-07-03 的只读审计。未发现此前那类“结构化修复/章节计划把配置的 `max_tokens` 覆盖成固定小值”的问题；但仍发现若干固定 token 数值场景，需要后续逐项判断是否合理。

已确认不属于同类风险的路径：

- `backend/app/services/generation_pipeline.py:289`：章节计划只覆盖 `temperature`；缺少有效配置时才调用 `default_max_tokens`。
- `backend/app/services/json_repair_service.py:91`：JSON 修复只覆盖 `temperature`。
- `backend/app/api/routes/outline.py:365`：大纲生成按章节数补高到 `8192` 或 `12000`，不会压低已有更高配置。
- `backend/app/services/length_control.py:14`：章节生成根据目标字数估算 token，并受 provider/model 能力上限约束。

---

## 文件职责映射

- `backend/app/llm/providers/anthropic_messages.py`：Anthropic Messages 非流式/流式请求 payload 构造、缺省 `max_tokens`、兼容重试降档。
- `backend/app/llm/providers/openai_chat.py`：OpenAI Chat Completions 请求 payload 构造和 400/422 兼容降档。
- `backend/app/llm/providers/openai_responses.py`：OpenAI Responses 请求 payload 构造和 400/422 兼容降档。
- `backend/app/llm/providers/gemini_generate_content.py`：Gemini Generate Content 请求 payload 构造和 400/422 兼容降档。
- `backend/app/services/worldbook_auto_update_service.py`：世界书章节级自动更新，当前按轮次压低 `max_tokens`。
- `backend/app/services/characters_auto_update_service.py`：角色自动更新，当前按轮次压低 `max_tokens`。
- `backend/app/services/graph_auto_update_service.py`：图谱自动更新，当前按轮次压低 `max_tokens`。
- `backend/app/services/plot_analysis_service.py`：剧情分析自动更新，当前按轮次压低 `max_tokens`。
- `backend/app/services/table_ai_update_service.py`：表格 AI 更新，当前按轮次压低 `max_tokens`。
- `backend/app/api/routes/llm.py`：LLM 连接测试接口，当前默认 `max_tokens=64`。
- `backend/app/services/llm_retry.py`：统一重试入口，实际应用各任务传入的 `llm_call_overrides_by_attempt`。
- `backend/app/llm/registry.py`、`backend/app/llm/capabilities.py`、`backend/app/llm/utils.py`：provider/model 推荐值和能力上限，后续替代硬编码时优先复用。
- `AGENTS.md`：若最终确认新的项目级约定，需要同步记录。

---

## Milestone 1: Provider 层固定 token 值审计

### Task 1: Anthropic 缺省 `max_tokens=1500`

**Files:**
- Analyze: `backend/app/llm/providers/anthropic_messages.py:33`
- Analyze: `backend/app/llm/providers/anthropic_messages.py:176`
- Potential test: `backend/tests/test_anthropic_messages_max_tokens_defaults.py`

- [ ] **Step 1: 读取现有 Anthropic provider 测试**

Run:

```bash
cd backend && rg -n "anthropic.*max_tokens|call_anthropic_messages|call_anthropic_messages_stream" tests app
```

Expected: 找到现有 Anthropic 请求参数测试和兼容重试测试。

- [ ] **Step 2: 判断缺省值来源是否应该改为 registry 推荐值**

检查：

```bash
cd backend && nl -ba app/llm/providers/anthropic_messages.py | sed -n '25,60p;168,205p'
cd backend && nl -ba app/llm/registry.py | sed -n '95,155p'
cd backend && nl -ba app/llm/utils.py | sed -n '1,45p'
```

判断标准：

- 如果正常调用进入 provider 前总能通过 `LLMPreset` / `LLMTaskPreset` 填入 `max_tokens`，则 `1500` 只属于防御兜底。
- 如果存在直接调用 `call_llm` 且未传 `max_tokens` 的业务路径，则 `1500` 可能导致截断，应改为 `default_max_tokens(provider, model)` 或在调用前补齐。

- [ ] **Step 3: 若需要修改，先补失败测试**

建议测试断言：

```python
def test_anthropic_missing_max_tokens_uses_provider_default():
    # 构造 filtered_params 不含 max_tokens 的请求
    # 捕获 payload["max_tokens"]
    # 期望值来自 app.llm.utils.default_max_tokens("anthropic", model)
    assert payload["max_tokens"] == default_max_tokens("anthropic", model)
```

Run:

```bash
cd backend && python -m pytest tests/test_anthropic_messages_max_tokens_defaults.py -q
```

Expected: 修改前 FAIL，指出当前仍为 `1500`。

- [ ] **Step 4: 实现最小改动并运行测试**

优先方案：在 provider 调用入口传入已规范化的 `filtered_params`，避免 provider 内部感知 registry。备选方案：provider 内部对缺省值调用统一默认值工具。

Run:

```bash
cd backend && python -m pytest tests/test_anthropic_messages_max_tokens_defaults.py tests/test_anthropic_max_tokens_retry.py -q
```

Expected: PASS。

### Task 2: Provider 兼容重试降档固定值

**Files:**
- Analyze: `backend/app/llm/providers/openai_chat.py:87`
- Analyze: `backend/app/llm/providers/openai_responses.py:260`
- Analyze: `backend/app/llm/providers/anthropic_messages.py:120`
- Analyze: `backend/app/llm/providers/gemini_generate_content.py:114`
- Potential shared helper: `backend/app/llm/max_tokens.py`
- Potential tests: existing provider retry tests under `backend/tests/`

- [ ] **Step 1: 列出所有降档阶梯**

Run:

```bash
cd backend && rg -n "clamp_max_tokens\\((16384|8192|4096|1024)|clamp_max_output_tokens\\((8192|4096|1024)" app/llm/providers tests
```

Expected: 输出 OpenAI Chat、OpenAI Responses、Anthropic、Gemini 的降档点和已有测试覆盖。

- [ ] **Step 2: 判断是否属于合理兼容策略**

判断标准：

- 初次请求必须使用配置传入值，不得主动压低。
- 只有上游返回 400/422 后才允许按错误提示或降档阶梯重试。
- 如果错误文本能提取上限，必须优先使用上游返回的上限。
- 固定阶梯应考虑 provider/model 能力上限，不能把请求升高。

- [ ] **Step 3: 若保留固定阶梯，补文档化测试或注释**

建议测试断言：

```python
def test_provider_retry_uses_configured_value_before_compat_clamp():
    # 第一次请求捕获原始配置 max_tokens
    # 模拟 400/422 后第二次请求才降档
    assert seen_max_tokens[0] == configured_max_tokens
    assert seen_max_tokens[1] <= configured_max_tokens
```

Run:

```bash
cd backend && python -m pytest tests/test_anthropic_max_tokens_retry.py tests/test_llm_contract_routes.py -q
```

Expected: PASS。

- [ ] **Step 4: 若需要消除重复固定阶梯，提取统一 helper**

候选接口：

```python
def compat_max_token_downgrade_limits(provider: str, model: str | None) -> list[int]:
    limit = max_output_tokens_limit(provider, model)
    candidates = [16384, 8192, 4096, 1024]
    return [value for value in candidates if limit is None or value <= limit]
```

注意：Gemini 当前没有 `16384` 阶梯，修改前需要确认模型能力和兼容网关行为。

---

## Milestone 2: 自动更新任务固定上限审计

### Task 3: 世界书、角色、图谱、剧情分析自动更新

**Files:**
- Analyze: `backend/app/services/worldbook_auto_update_service.py:759`
- Analyze: `backend/app/services/characters_auto_update_service.py:434`
- Analyze: `backend/app/services/graph_auto_update_service.py:380`
- Analyze: `backend/app/services/plot_analysis_service.py:823`
- Analyze: `backend/app/services/llm_retry.py:200`
- Potential tests: `backend/tests/test_chapter_analysis_llm_params.py`

- [ ] **Step 1: 确认这些任务是否应压低用户配置**

Run:

```bash
cd backend && rg -n "worldbook_auto_update|characters_auto_update|graph_auto_update|plot_auto_update|max_tokens" tests app/services
```

Expected: 找到自动更新任务的现有测试、run_type 和重试参数覆盖点。

- [ ] **Step 2: 分类每个任务的 token 策略**

逐个记录判断：

- `worldbook_auto_update`: 当前 `2048/1024/512`，适合小 JSON ops，但可能截断长世界书条目。
- `characters_auto_update`: 当前 `2048/1024/512`，适合角色增量 ops，但可能截断多角色章节。
- `graph_auto_update`: 当前 `2048/1024/512`，当前 prompt 已限制 ops 数量，可考虑保留或按章节长度动态放宽。
- `plot_auto_update`: 当前 `2048/1024/512`，剧情记忆点可能比 ops 更长，需要重点验证。

- [ ] **Step 3: 决定是否将“第一轮压低”改为“保留配置，重试才压低”**

推荐判断标准：

- 第一轮应尽量使用任务预设配置的 `max_tokens`。
- 第二轮和第三轮可使用较小值，因为 retry prompt 明确要求更短输出。
- 如果第一轮仍需上限，应由任务预设、provider 能力上限或专用配置决定，而不是服务内硬编码。

建议目标行为：

```python
llm_call_overrides_by_attempt={
    1: {"temperature": 0.2},
    2: {"temperature": 0.1, "max_tokens": min(retry_limit, configured_max_tokens)},
    3: {"temperature": 0.0, "max_tokens": min(retry_limit, configured_max_tokens)},
}
```

- [ ] **Step 4: 为每个任务补参数保持测试**

建议测试断言：

```python
def test_auto_update_first_attempt_keeps_configured_max_tokens():
    configured = 12000
    # 捕获 call_llm_and_record_with_retries 传入的 overrides
    assert overrides[1].get("max_tokens") is None
    assert overrides[2]["max_tokens"] <= configured
```

Run:

```bash
cd backend && python -m pytest tests/test_chapter_analysis_llm_params.py -q
```

Expected: 修改前至少对相关任务 FAIL，修改后 PASS。

### Task 4: 表格 AI 更新固定上限

**Files:**
- Analyze: `backend/app/services/table_ai_update_service.py:45`
- Analyze: `backend/app/services/table_ai_update_service.py:486`
- Existing test: `backend/tests/test_table_ai_update_timeout_retry.py`

- [ ] **Step 1: 读取表格 AI 更新现有测试**

Run:

```bash
cd backend && nl -ba tests/test_table_ai_update_timeout_retry.py | sed -n '1,170p'
cd backend && nl -ba app/services/table_ai_update_service.py | sed -n '35,55p;440,490p'
```

Expected: 看到当前测试明确期望 `1024/512/512`。

- [ ] **Step 2: 判断 `1024/512` 是否是业务协议的一部分**

判断标准：

- 如果表格更新 prompt 明确限制只输出少量 ops，固定值可保留，但需要记录为任务级上限。
- 如果用户配置更大是为了容纳复杂表格 schema，则第一轮不应强制压到 `1024`。
- 重试轮次可以继续压低，因为 retry prompt 明确要求短输出。

- [ ] **Step 3: 如调整行为，先改测试期望**

建议测试断言：

```python
assert (overrides.get(1) or {}).get("max_tokens") is None
assert (overrides.get(2) or {}).get("max_tokens") == 512
assert (overrides.get(3) or {}).get("max_tokens") == 512
```

Run:

```bash
cd backend && python -m pytest tests/test_table_ai_update_timeout_retry.py -q
```

Expected: 修改前 FAIL，修改后 PASS。

---

## Milestone 3: 测试接口与动态估算场景确认

### Task 5: LLM 连接测试默认 `max_tokens=64`

**Files:**
- Analyze: `backend/app/api/routes/llm.py:87`
- Potential test: existing LLM route tests under `backend/tests/`

- [ ] **Step 1: 确认连接测试请求语义**

Run:

```bash
cd backend && nl -ba app/api/routes/llm.py | sed -n '70,105p'
cd backend && rg -n "test.*llm|LLM_CONFIG|connection test|max_tokens.*64" tests app
```

Expected: 找到连接测试接口和相关测试。

- [ ] **Step 2: 判断默认 `64` 是否合理保留**

判断标准：

- 连接测试只验证 API Key、base URL、model 和参数兼容，不生成业务内容。
- 默认 `64` 可降低成本和响应时间。
- 如果用户显式传入 `body.params.max_tokens`，当前 `setdefault` 不会覆盖，应保留此行为。

- [ ] **Step 3: 若保留，补测试防止误改**

建议测试断言：

```python
def test_llm_connection_test_defaults_max_tokens_to_64_only_when_missing():
    assert sent_params["max_tokens"] == 64

def test_llm_connection_test_respects_explicit_max_tokens():
    assert sent_params["max_tokens"] == 256
```

Run:

```bash
cd backend && python -m pytest tests/test_llm_routes.py -q
```

Expected: PASS；如果文件不存在，先搜索现有路由测试并追加到最接近的测试文件。

### Task 6: 大纲补高和目标字数估算类场景确认

**Files:**
- Analyze: `backend/app/api/routes/outline.py:365`
- Analyze: `backend/app/services/length_control.py:14`
- Existing tests: `backend/tests/test_outline_generation_guidance.py`

- [ ] **Step 1: 确认大纲补高不压低用户配置**

Run:

```bash
cd backend && python -m pytest tests/test_outline_generation_guidance.py -q
```

Expected: 覆盖“当前 `max_tokens` 已足够高时不覆盖”的测试通过。

- [ ] **Step 2: 确认目标字数估算受模型能力上限约束**

Run:

```bash
cd backend && nl -ba app/services/length_control.py | sed -n '1,80p'
cd backend && rg -n "estimate_max_tokens" tests app
```

Expected: `estimate_max_tokens` 使用 `max_output_tokens_limit(provider, model)`，不是单纯固定值。

- [ ] **Step 3: 如发现缺测试，补最小单测**

建议测试断言：

```python
def test_estimate_max_tokens_respects_model_output_cap():
    value = estimate_max_tokens(target_word_count=10000, provider="openai", model="gpt-4o-mini")
    assert value <= max_output_tokens_limit("openai", "gpt-4o-mini")
```

Run:

```bash
cd backend && python -m pytest tests/test_length_control.py -q
```

Expected: PASS。

---

## Milestone 4: 项目约定沉淀与收尾

### Task 7: 更新项目级说明

**Files:**
- Modify: `AGENTS.md`
- Potential modify: `.trellis/spec/backend/quality-guidelines.md`

- [ ] **Step 1: 判断是否形成新约定**

只有在完成前面分析并确认行为后再更新文档。候选约定：

- 初次业务 LLM 请求不得用服务内固定小值覆盖任务预设 `max_tokens`。
- 兼容重试可以在 400/422 后降档，但必须记录为兼容策略。
- 明确属于连接测试或目标字数估算的场景可以使用固定/派生 token 值。

- [ ] **Step 2: 更新 `AGENTS.md`**

建议新增到 “LLM 调用参数约定”：

```markdown
- 业务 LLM 调用的首轮请求应优先保留模型配置页或任务预设解析后的 `max_tokens`；如需限制输出长度，应优先通过任务预设、prompt 输出约束或重试轮次控制，避免在服务层用固定小值压低首轮请求。
- provider 兼容重试在上游 400/422 后可按错误提示或降档阶梯调整 token 参数；该逻辑属于兼容策略，不应影响首轮请求。
```

- [ ] **Step 3: 运行文档和目标测试**

Run:

```bash
git diff --check
cd backend && python -m pytest tests/test_outline_generation_guidance.py tests/test_chapter_analysis_llm_params.py tests/test_table_ai_update_timeout_retry.py -q
```

Expected: `git diff --check` PASS；目标测试 PASS 或记录现有阻塞。

- [ ] **Step 4: 按 milestone 独立提交**

Commit message 使用中文 Conventional Commits，例如：

```bash
git add <changed-files>
git commit -m "test(llm): 补充令牌参数保持测试"
git commit -m "fix(llm): 保留自动更新首轮令牌配置"
git commit -m "docs(llm): 记录令牌参数调用约定"
```

---

## 当前待分析清单

- [ ] Anthropic 缺省 `max_tokens=1500` 是否应改为 registry 默认值。
- [ ] provider 兼容重试固定降档值是否应提取统一 helper 或保留本地阶梯。
- [ ] 世界书自动更新第一轮 `2048` 是否应保留配置。
- [ ] 角色自动更新第一轮 `2048` 是否应保留配置。
- [ ] 图谱自动更新第一轮 `2048` 是否应保留配置。
- [ ] 剧情分析自动更新第一轮 `2048` 是否应保留配置。
- [ ] 表格 AI 更新第一轮 `1024` 是否应保留配置。
- [ ] LLM 连接测试默认 `64` 是否补测试并文档化。
- [ ] 大纲补高和目标字数估算是否补充回归测试。
- [ ] 分析完成后更新 `AGENTS.md` / 后端规范。

## 验证记录

- 2026-07-03：创建计划文件，未修改业务代码，未运行后端测试。
