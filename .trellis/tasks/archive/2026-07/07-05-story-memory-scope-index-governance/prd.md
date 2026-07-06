# 剧情记忆作用域与索引治理

## Goal

让剧情记忆、普通搜索索引和向量检索索引按大纲作用域隔离，避免历史大纲产生的记忆污染当前大纲章节生成，同时给用户提供可视化治理入口，手动保留、归属或删除有价值/无关的剧情记忆。

## Background

- 用户排查到章节生成中反复出现“松本梨纱”，实际来源不是代码模板，而是历史 `story_memories`、`search_documents`、`vector_chunks` 数据。
- 当前 `story_memories` 只有项目级 `project_id` 和可选 `chapter_id`，缺少明确的大纲归属；`chapter_id = NULL` 的历史记忆会作为项目级记忆被生成链路召回。
- 当前 active outline `01080bab-2b65-416e-bcdb-1c58cd8b1553` 不包含“松本梨纱”，但历史大纲和无章节归属的 `story_memories` 包含该人物，生成时通过 `<StoryMemory>` 注入。
- 用户确认产品方向：用户可以手动修改/删除无关剧情记忆，保留有用记忆；系统默认要避免跨大纲污染。

## Confirmed Decisions

- `story_memories` 增加显式作用域，不再用 `chapter_id = NULL` 隐式表达全局。
- 作用域三态：
  - `outline`：归属某个大纲，默认用于章节分析/自动更新产生的剧情记忆。
  - `project`：用户明确标记的项目全局记忆，可跨大纲注入。
  - `unassigned`：历史迁移或无法判断来源的旧记忆，默认不参与生成注入。
- `story_memories` 增加 `outline_id`。
- 历史迁移规则：
  - `chapter_id` 能找到章节且章节有 `outline_id`：`scope=outline`，`outline_id=chapters.outline_id`。
  - `chapter_id=NULL`：`scope=unassigned`。
  - `chapter_id` 指向不存在章节：`scope=unassigned`。
  - 不自动把历史数据猜成 `project`。
- 生成注入严格过滤：当前大纲 `scope=outline AND outline_id=当前 outline_id` 加 `scope=project`。
- `semantic_history`、`vector_rag` 中 `story_memory` 来源、`foreshadow_open_loops` 也按同一作用域过滤。
- 页面上明确显示“是否会注入当前大纲”状态。
- 用户治理入口优先扩展现有「剧情记忆」页，不新建独立入口。
- 删除仍采用物理删除，不做软删除。
- 删除/修改顺序：先处理派生索引，再处理 `story_memories` 源数据。
- 删除单条/批量 `story_memory` 时定点删除相关 `search_documents` 和 `vector_chunks`，不全量重建，不调用 embedding。
- 修改内容时，普通搜索可以单条 upsert；向量索引需要局部重新 embedding 该条记忆，不能用旧向量。

## Requirements

### R1. 数据模型与迁移

- `story_memories` 必须包含 `scope` 和 `outline_id` 字段。
- `scope` 合法值为 `outline`、`project`、`unassigned`。
- 新增/更新 `story_memory` 时必须校验 `scope` 与 `outline_id` 的组合：
  - `scope=outline` 必须有有效 `outline_id`，且归属当前项目。
  - `scope=project` / `scope=unassigned` 的 `outline_id` 应为空。
- 历史数据迁移必须按 Confirmed Decisions 回填。

### R2. 生成注入隔离

- 章节生成、上下文预览、记忆检索日志中，`story_memory` 直接注入只允许当前大纲记忆和项目全局记忆。
- `foreshadow_open_loops` 只允许当前大纲记忆和项目全局记忆。
- `semantic_history` 和 `vector_rag` 的 `story_memory` 来源必须按当前大纲作用域过滤，不能召回其他大纲或未归属旧记忆。
- 未归属历史记忆默认不参与生成注入。

### R3. 用户治理入口

- 「剧情记忆」页必须能查看全项目剧情记忆。
- 页面必须支持关键词、类型、作用域、所属大纲/章节等过滤。
- 每条记忆必须展示作用域、所属大纲/章节、是否会注入当前大纲。
- 用户必须能编辑、删除、合并、标记完成，并能将记忆设为当前大纲、项目全局或未归属。
- 未归属历史记忆必须有明确提示：默认不参与生成，可手动归属或删除。

### R4. 索引一致性

- 删除 `story_memory` 时必须先定点删除相关 `search_documents` 和 Postgres `vector_chunks`，再删除源记录。
- 如果派生索引删除失败，不删除源 `story_memory`。
- 单条删除和批量删除都不得触发全量 `vector_rebuild`。
- 修改内容时，源记录更新前必须确保搜索索引和向量索引能同步到新内容；向量索引需要局部 embedding，失败则不更新源记录。
- 修改作用域/大纲归属时，派生索引 metadata 必须同步，避免搜索/RAG 页面过滤错误。
- 无法强事务一致的外部向量后端失败时，不应删除/修改源记录；不可确认状态必须标记 dirty，并阻止脏 vector_rag 自动注入。

### R5. 搜索与 RAG 可见性

- 搜索页可查询历史数据，但结果需要展示或携带作用域信息，并支持当前大纲/项目全局/未归属/全部筛选。
- RAG 页默认行为应贴近生成：默认按当前大纲作用域过滤，排障时可切换范围。
- 管理页默认显示当前大纲会注入的记忆和未归属历史告警，可切换全部历史。

## Acceptance Criteria

- [x] 数据库迁移后，`chapter_id=NULL` 的历史 `story_memories` 被标记为 `scope=unassigned`，默认不再参与章节生成注入。
- [x] 有章节来源的历史 `story_memories` 能通过章节回填 `outline_id`，并只在对应大纲下参与注入。
- [x] 对当前大纲生成章节时，其他大纲的 `story_memories` 不出现在 `prompt_system`、`memory_pack.story_memory.text_md`、`semantic_history.text_md` 或 `vector_rag.text_md` 中。
- [x] 删除单条 `story_memory` 后，对应 `search_documents` 和 `vector_chunks` 同步消失，且没有调度全量 `vector_rebuild`。
- [x] 派生索引删除失败时，`story_memory` 源记录仍保留并返回可追踪错误。
- [x] 剧情记忆管理页能筛选和显示 `scope`、`outline_id`、章节来源与“是否会注入当前大纲”。
- [x] 用户能把未归属记忆设为当前大纲、设为项目全局、移回未归属或删除。
- [x] 搜索/RAG 查询支持作用域过滤，默认不会让未归属或其他大纲记忆影响生成排障结论。
- [x] 后端记忆/RAG/搜索相关回归测试通过。
- [x] 前端相关类型、页面状态和 UI 检查通过。

## Out Of Scope

- 本次不做软删除/恢复站。
- 本次不要求用户逐条编辑 `search_documents` 或 `vector_chunks`。
- 本次不改变世界书、角色、结构化记忆等非 StoryMemory 的作用域模型。
- 本次不重做所有向量后端架构；优先保证 Postgres `vector_chunks` 的定点删除/过滤。
