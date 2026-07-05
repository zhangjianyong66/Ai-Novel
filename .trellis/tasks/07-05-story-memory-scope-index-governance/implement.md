# 剧情记忆作用域与索引治理实现计划

## 顺序

### 1. 后端模型与迁移

- [ ] 新增 Alembic 迁移：`story_memories.scope`、`story_memories.outline_id`。
- [ ] 回填历史数据：有章节来源归属章节大纲；无章节来源或失效章节归为 `unassigned`。
- [ ] 更新 `backend/app/models/story_memory.py`。
- [ ] 新增/更新迁移测试，覆盖 `chapter_id=NULL` 和可回填章节两类历史数据。

验证：

```bash
cd backend && python3 -m pytest tests/test_story_memory_scope_migration.py -q
```

### 2. 后端 StoryMemory API 契约

- [ ] 扩展 `backend/app/api/routes/story_memory.py` 请求/响应字段：`scope`、`outline_id`、注入状态派生字段。
- [ ] 增加筛选参数：`scope`、`outline_id`、`q`、`memory_type`、`injectable_for_outline_id`。
- [ ] 增加批量操作 API，至少支持批量删除和批量设置作用域。
- [ ] 作用域校验失败使用 `AppError.validation`。

验证：

```bash
cd backend && python3 -m pytest tests/test_story_memory_routes.py -q
```

### 3. 派生索引定点同步

- [ ] 新建或扩展索引服务，提供 `story_memory` 的搜索索引删除、向量 chunk 删除和 metadata 同步。
- [ ] 调整单条删除：先删 `search_documents`，再删 `vector_chunks`，最后删 `story_memories`。
- [ ] 调整批量删除：先批量删派生索引，再批量删源数据。
- [ ] 删除路径不再调度全量 `vector_rebuild`。
- [ ] 索引删除失败时回滚并保留源数据。

验证：

```bash
cd backend && python3 -m pytest tests/test_story_memory_index_consistency.py -q
```

### 4. 生成注入与检索过滤

- [ ] 提取共享作用域过滤 helper，供记忆检索、伏笔 open loops、Vector RAG 使用。
- [ ] `retrieve_memory_context_pack` 增加 `outline_id`，直接 story_memory 和 foreshadow 查询按作用域过滤。
- [ ] `vector_rag_service` 的 story_memory chunks 构建和查询增加 `scope`/`outline_id` metadata，并按当前大纲过滤。
- [ ] 章节生成、上下文预览、RAG 页面调用传入当前章节/当前大纲 `outline_id`。

验证：

```bash
cd backend && python3 -m pytest tests/test_memory_retrieval_scope.py tests/test_vector_rag_story_memory_scope.py -q
```

### 5. 搜索与 RAG API 作用域

- [ ] 搜索索引文档 locator/metadata 增加 story memory scope/outline。
- [ ] 搜索查询 API 支持作用域过滤。
- [ ] RAG 查询 API 支持 `outline_id` 和作用域范围，默认贴近生成行为。

验证：

```bash
cd backend && python3 -m pytest tests/test_search_story_memory_scope.py tests/test_vector_routes_scope.py -q
```

### 6. 前端剧情记忆管理页

- [ ] 扩展 `frontend/src/services/storyMemoryApi.ts` 类型和查询参数。
- [ ] 扩展「剧情记忆」页面/侧栏列表，展示作用域、大纲/章节和“是否会注入当前大纲”。
- [ ] 增加筛选控件和批量操作控件。
- [ ] 删除/批量删除确认框展示会删除源记忆和相关索引。

验证：

```bash
cd frontend && npx eslint src/services/storyMemoryApi.ts src/pages/ChapterAnalysisPage.tsx src/components/chapterAnalysis/MemorySidebar.tsx
cd frontend && npx prettier --check src/services/storyMemoryApi.ts src/pages/ChapterAnalysisPage.tsx src/components/chapterAnalysis/MemorySidebar.tsx
```

### 7. 前端搜索/RAG 排障视图

- [ ] 搜索页显示 story memory 作用域信息，增加作用域筛选。
- [ ] RAG 页增加作用域筛选，默认当前大纲/项目全局。
- [ ] 上下文预览中保留过滤日志，便于确认某条记忆为什么没有注入。

验证：

```bash
cd frontend && npx eslint src/pages/SearchPage.tsx src/pages/rag
cd frontend && npx prettier --check src/pages/SearchPage.tsx src/pages/rag
```

### 8. 集成验证

- [ ] 在测试数据中创建两个大纲，各自有 story memory，确认当前大纲生成只注入本大纲和项目全局。
- [ ] 删除污染记忆，确认 `search_documents` 与 `vector_chunks` 定点消失。
- [ ] 运行相关后端测试集合。
- [ ] 运行触碰前端文件的 eslint/prettier 和 UI class 检查。
- [ ] 如发现新的项目运行约定，更新 `AGENTS.md`。

建议命令：

```bash
cd backend && python3 -m pytest tests/test_story_memory_routes.py tests/test_memory_retrieval_scope.py tests/test_vector_rag_story_memory_scope.py tests/test_search_story_memory_scope.py -q
cd frontend && node scripts/check-ui-classes.mjs
```

## 风险点

- 向量后端如果不是 Postgres `vector_chunks`，定点删除可能无法强事务一致；本次优先保证 Postgres，外部后端失败时保留源数据并标记 dirty。
- 作用域过滤必须进入生成链路和排障链路，否则页面看到的 RAG 结果会和实际生成不一致。
- 历史 `chapter_id=NULL` 变成 `unassigned` 后，部分用户确实想保留的全局记忆需要手动标记为 `project`。
